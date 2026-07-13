declare module 'xlsx' {
  export type WorkBook = { SheetNames: string[]; Sheets: Record<string, WorkSheet> };
  export type WorkSheet = Record<string, unknown>;
  export const utils: {
    sheet_to_json<T = unknown>(sheet: WorkSheet, options?: Record<string, unknown>): T[];
    aoa_to_sheet(data: unknown[][]): WorkSheet;
    book_new(): WorkBook;
    book_append_sheet(workbook: WorkBook, worksheet: WorkSheet, name: string): void;
  };
  export function read(data: unknown, options?: Record<string, unknown>): WorkBook;
  export function write(workbook: WorkBook, options?: Record<string, unknown>): Buffer;
}
