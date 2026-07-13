import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

import { parseTabularFile } from './file-parser';

const headers = [
  'numero_entrega',
  'documento_cliente',
  'nome_cliente',
  'status_entrega',
  'data_emissao',
  'data_prevista',
  'data_entrega',
  'valor_frete',
  'valor_total',
  'peso_total',
  'quantidade_volumes',
  'ocorrencia',
  'motorista',
  'veiculo',
  'uf_origem',
  'uf_destino',
  'cidade_origem',
  'cidade_destino',
];

const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.aoa_to_sheet([
  headers,
  [
    'ENT-1',
    '11222333000144',
    'Cliente Teste',
    'em_transito',
    new Date('2026-07-12T00:00:00.000Z'),
    new Date('2026-07-15T00:00:00.000Z'),
    null,
    12.5,
    25,
    123.45,
    3,
    '',
    'Motorista Teste',
    'ABC1D23',
    'SP',
    'RJ',
    'São Paulo',
    'Rio de Janeiro',
  ],
]);
XLSX.utils.book_append_sheet(workbook, worksheet, 'Primeira aba');

const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
const parsed = parseTabularFile(buffer, 'entregas.xlsx');

assert.equal(parsed.headers.length, 18);
assert.ok(parsed.rows.length >= 1);
assert.equal(parsed.rows[0]?.numero_entrega, 'ENT-1');
assert.equal(parsed.rows[0]?.valor_frete, 12.5);
assert.ok(parsed.rows[0]?.peso_total !== undefined);

console.log('file-parser XLSX local test passed');
