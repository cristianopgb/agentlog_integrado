import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
interface AppDataTableProps {
  columns: ReactNode[];
  children: ReactNode;
  caption?: string;
}
function AppDataTable({ columns, children, caption }: AppDataTableProps) {
  return (
    <Table className="app-data-table min-w-[640px]">
      {caption && <caption className="sr-only">{caption}</caption>}
      <TableHeader>
        <TableRow>
          {columns.map((column, index) => (
            <TableHead key={index}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}
export { AppDataTable };
