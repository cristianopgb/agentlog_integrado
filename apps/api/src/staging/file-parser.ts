import { BadRequestException } from '@nestjs/common';
import { unzipSync } from 'fflate';

export type ParsedFile = { headers: string[]; rows: Record<string, unknown>[] };

const xlsxReadError =
  'Não foi possível ler a primeira aba do XLSX. Verifique se o arquivo é uma planilha .xlsx válida.';

export function parseTabularFile(buffer: Buffer, filename: string): ParsedFile {
  const lower = filename.toLowerCase();
  try {
    if (lower.endsWith('.csv')) return parseCsv(buffer.toString('utf8'));
    if (lower.endsWith('.xlsx')) return parseXlsx(buffer);
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(
      lower.endsWith('.xlsx')
        ? xlsxReadError
        : 'Não foi possível interpretar o arquivo enviado. Verifique se o XLSX/CSV está íntegro e possui cabeçalho.',
    );
  }
  throw new BadRequestException('Apenas arquivos .xlsx e .csv são aceitos.');
}

function parseCsv(text: string): ParsedFile {
  const normalized = text.replace(/^\uFEFF/, '');
  const firstLine = normalized.split(/\r?\n/, 1)[0] ?? '';
  const delimiter =
    countDelimiter(firstLine, ';') > countDelimiter(firstLine, ',') ? ';' : ',';
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(current.trim());
      current = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current.trim());
      current = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      continue;
    }
    current += char;
  }
  row.push(current.trim());
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rowsToObjects(rows, { trimHeaders: true });
}

function parseXlsx(buffer: Buffer): ParsedFile {
  try {
    const files = unzipSync(new Uint8Array(buffer));
    const workbook = readZipText(files, 'xl/workbook.xml');
    const rels = readZipText(files, 'xl/_rels/workbook.xml.rels');
    const firstSheetRelId = workbook.match(
      /<sheet\b[^>]*\br:id="([^"]+)"/,
    )?.[1];
    if (!firstSheetRelId) throw new Error('missing first sheet');
    const relationship = Array.from(
      rels.matchAll(/<Relationship\b([^>]*)\/>/g),
    ).find((match) => getXmlAttr(match[1], 'Id') === firstSheetRelId);
    const target = relationship ? getXmlAttr(relationship[1], 'Target') : null;
    if (!target) throw new Error('missing first sheet relationship');
    const sheetPath = resolveWorkbookTarget(target);
    const sheet = readZipText(files, sheetPath);
    const shared = parseSharedStrings(
      readOptionalZipText(files, 'xl/sharedStrings.xml'),
    );
    const rows = parseSheetRows(sheet, shared);
    return rowsToObjects(rows, { trimHeaders: false });
  } catch {
    throw new BadRequestException(xlsxReadError);
  }
}

function rowsToObjects(
  rows: unknown[][],
  options: { trimHeaders: boolean },
): ParsedFile {
  const firstRow = rows[0] ?? [];
  const headers = firstRow
    .map((header) =>
      options.trimHeaders ? String(header).trim() : String(header),
    )
    .filter((header) => header !== '');
  if (!headers.length) throw new BadRequestException('Arquivo sem cabeçalho.');
  const dataRows = rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  return {
    headers,
    rows: dataRows.map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? null]),
      ),
    ),
  };
}

function parseSheetRows(sheet: string, shared: string[]): unknown[][] {
  return Array.from(sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)).map(
    (rowMatch) => {
      const cells: unknown[] = [];
      for (const cellMatch of rowMatch[1].matchAll(
        /<c\b([^>]*)>([\s\S]*?)<\/c>/g,
      )) {
        const attrs = cellMatch[1];
        const body = cellMatch[2];
        const ref = getXmlAttr(attrs, 'r')?.match(/^([A-Z]+)\d+$/)?.[1];
        const index = ref ? columnIndex(ref) : cells.length;
        cells[index] = parseCellValue(attrs, body, shared);
      }
      return cells.map((cell) => cell ?? null);
    },
  );
}

function parseCellValue(attrs: string, body: string, shared: string[]) {
  const type = getXmlAttr(attrs, 't');
  const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
  const inline = body.match(
    /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/,
  )?.[1];
  if (type === 's') return shared[Number(raw)] ?? '';
  if (type === 'inlineStr') return decodeXml(inline ?? '');
  if (type === 'str') return decodeXml(raw ?? '');
  if (type === 'b') return raw === '1';
  if (type === 'd' && raw) return new Date(raw).toISOString();
  if (raw === undefined || raw === '') return null;
  const numeric = Number(raw);
  return Number.isNaN(numeric) ? decodeXml(raw) : numeric;
}

function readZipText(files: Record<string, Uint8Array>, path: string) {
  const content = files[path];
  if (!content) throw new Error(`missing ${path}`);
  return Buffer.from(content).toString('utf8');
}

function readOptionalZipText(files: Record<string, Uint8Array>, path: string) {
  const content = files[path];
  return content ? Buffer.from(content).toString('utf8') : '';
}

function resolveWorkbookTarget(target: string) {
  return target.startsWith('/') ? target.replace(/^\//, '') : `xl/${target}`;
}

function getXmlAttr(attrs: string, name: string) {
  return attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
}

function countDelimiter(line: string, delimiter: string) {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) count += 1;
  }
  return count;
}

function parseSharedStrings(xml: string) {
  return Array.from(xml.matchAll(/<si>([\s\S]*?)<\/si>/g)).map((match) =>
    decodeXml(
      Array.from(match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
        .map((text) => text[1])
        .join(''),
    ),
  );
}
function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
function columnIndex(col: string) {
  return (
    col.split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) -
    1
  );
}
