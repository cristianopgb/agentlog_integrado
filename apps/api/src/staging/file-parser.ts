import { BadRequestException } from '@nestjs/common';
import { inflateRawSync } from 'node:zlib';

export type ParsedFile = { headers: string[]; rows: Record<string, unknown>[] };

export function parseTabularFile(buffer: Buffer, filename: string): ParsedFile {
  const lower = filename.toLowerCase();
  try {
    if (lower.endsWith('.csv')) return parseCsv(buffer.toString('utf8'));
    if (lower.endsWith('.xlsx')) return parseXlsx(buffer);
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Não foi possível interpretar o arquivo enviado. Verifique se o XLSX/CSV está íntegro e possui cabeçalho.');
  }
  throw new BadRequestException('Apenas arquivos .xlsx e .csv são aceitos.');
}

function parseCsv(text: string): ParsedFile {
  const normalized = text.replace(/^\uFEFF/, '');
  const firstLine = normalized.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = countDelimiter(firstLine, ';') > countDelimiter(firstLine, ',') ? ';' : ',';
  const rows: string[][] = [];
  let current = ''; let row: string[] = []; let quoted = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i]; const next = normalized[i + 1];
    if (char === '"' && quoted && next === '"') { current += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(current.trim()); current = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current.trim()); current = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = []; continue;
    }
    current += char;
  }
  row.push(current.trim()); if (row.some((cell) => cell !== '')) rows.push(row);
  return rowsToObjects(rows);
}

function parseXlsx(buffer: Buffer): ParsedFile {
  const files = readZip(buffer);
  const workbook = files.get('xl/workbook.xml');
  const rels = files.get('xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) throw new BadRequestException('Arquivo XLSX inválido ou sem workbook.');
  const firstSheetRelId = workbook.match(/<sheet[^>]*r:id="([^"]+)"/)?.[1];
  if (!firstSheetRelId) throw new BadRequestException('XLSX sem primeira aba interpretável.');
  const relMatch = new RegExp(`<Relationship[^>]*Id="${escapeRegExp(firstSheetRelId)}"[^>]*Target="([^"]+)"`).exec(rels);
  const sheetPath = `xl/${(relMatch?.[1] ?? 'worksheets/sheet1.xml').replace(/^\//, '')}`;
  const sheet = files.get(sheetPath);
  if (!sheet) throw new BadRequestException('Primeira aba do XLSX não encontrada.');
  const shared = parseSharedStrings(files.get('xl/sharedStrings.xml') ?? '');
  const rows = Array.from(sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)).map((rowMatch) => {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1]; const body = cellMatch[2];
      const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1];
      const index = ref ? columnIndex(ref) : cells.length;
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '';
      cells[index] = attrs.includes('t="s"') ? (shared[Number(raw)] ?? '') : decodeXml(raw);
    }
    return cells.map((cell) => cell ?? '');
  });
  return rowsToObjects(rows);
}

function rowsToObjects(rows: string[][]): ParsedFile {
  const headers = (rows[0] ?? []).map((header) => String(header).trim()).filter(Boolean);
  if (!headers.length) throw new BadRequestException('Arquivo sem cabeçalho.');
  const dataRows = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  return { headers, rows: dataRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null]))) };
}

function readZip(buffer: Buffer) {
  const files = new Map<string, string>();
  const end = findEndOfCentralDirectory(buffer);
  if (end < 0) throw new BadRequestException('Arquivo XLSX inválido: diretório ZIP não encontrado.');
  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < entries; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new BadRequestException('Arquivo XLSX inválido: entrada ZIP corrompida.');
    const method = buffer.readUInt16LE(offset + 10); const compressedSize = buffer.readUInt32LE(offset + 20); const fileNameLength = buffer.readUInt16LE(offset + 28); const extraLength = buffer.readUInt16LE(offset + 30); const commentLength = buffer.readUInt16LE(offset + 32); const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8');
    const localNameLength = buffer.readUInt16LE(localOffset + 26); const localExtraLength = buffer.readUInt16LE(localOffset + 28); const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    if (!name.endsWith('/')) files.set(name, (method === 0 ? compressed : inflateRawSync(compressed)).toString('utf8'));
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return files;
}
function findEndOfCentralDirectory(buffer: Buffer) { for (let i = buffer.length - 22; i >= 0; i -= 1) if (buffer.readUInt32LE(i) === 0x06054b50) return i; return -1; }
function countDelimiter(line: string, delimiter: string) { let count = 0; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"') quoted = !quoted; else if (char === delimiter && !quoted) count += 1; } return count; }
function parseSharedStrings(xml: string) { return Array.from(xml.matchAll(/<si>([\s\S]*?)<\/si>/g)).map((m) => decodeXml(Array.from(m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((t) => t[1]).join(''))); }
function decodeXml(value: string) { return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
function columnIndex(col: string) { return col.split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1; }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
