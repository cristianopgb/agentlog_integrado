import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const sourcePath = new URL('../lib/canonical-field-display.ts', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

assert.equal(helpers.getCanonicalFieldGroup('carga_filial_romaneio'), 'Carga');
assert.equal(helpers.getCanonicalFieldGroup('status', 'finance_records'), 'Financeiro');
assert.equal(helpers.getCanonicalFieldGroup('ocorrencias_status'), 'Ocorrência');
assert.equal(helpers.formatCanonicalFieldLabel('carga_filial_romaneio'), 'Número do romaneio');
assert.equal(helpers.formatCanonicalFieldLabel('carga_data_desc'), 'Data da descarga');
assert.equal(helpers.formatCanonicalFieldLabel('carga_codigo_rota'), 'Código rota');

assert.deepEqual(
  [...helpers.MAPPING_SOURCE_FIELD_GROUP_ORDER],
  ['Carga', 'Entrega', 'Transporte', 'Cliente', 'Contato', 'Ocorrência', 'Eventos de Ocorrência', 'Financeiro', 'Canhoto', 'Geral'],
);
assert.equal(helpers.getMappingSourceFieldGroup('ocorrencia_evento_tipo'), 'Eventos de Ocorrência');
assert.equal(helpers.getMappingSourceFieldGroup('campo_avulso'), 'Geral');
for (const [key, label] of [
  ['carga_id', 'Código da carga'],
  ['carga_filial_romaneio', 'Número do romaneio'],
  ['carga_data_desc', 'Data da descarga'],
  ['financeiro_valor_frete', 'Valor do frete'],
  ['transporte_nro_doc', 'Número documento'],
]) assert.equal(helpers.formatMappingSourceFieldLabel(key), label);

const sourceSearch = helpers.normalizeMappingSourceFieldSearchText('carga_filial_romaneio');
for (const query of ['romaneio', 'carga_filial_romaneio', 'carga']) {
  const tokens = helpers.normalizeCanonicalFieldQuery(query).split(' ');
  assert(tokens.every((token) => sourceSearch.includes(token)), `Busca da fonte não encontrou: ${query}`);
}

const search = helpers.normalizeCanonicalFieldSearchText(
  'carga_motorista_telefone',
  helpers.formatCanonicalFieldLabel('carga_motorista_telefone'),
  helpers.getCanonicalFieldGroup('carga_motorista_telefone'),
);
for (const query of ['motorista telefone', 'carga_motorista_telefone', 'carga', 'phone']) {
  const tokens = helpers.normalizeCanonicalFieldQuery(query).split(' ');
  assert(tokens.every((token) => search.includes(token)), `Busca não encontrou: ${query}`);
}
console.log('canonical field display: ok');
