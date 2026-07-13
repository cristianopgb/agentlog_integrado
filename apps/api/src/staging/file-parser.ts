import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

export type ParsedFile = { headers: string[]; rows: Record<string, unknown>[] };

const xlsxReadError =
  'Não foi possível ler o XLSX. Verifique se o arquivo é uma planilha .xlsx válida com cabeçalho na primeira linha.';

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
    const workbook = XLSX.read(buffer, { cellDates: true, type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
    if (!firstSheet) throw new Error('missing first sheet');

    const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
      blankrows: false,
      defval: null,
      header: 1,
      raw: true,
    });

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
