import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getStrictLogisticKeySetupContext,
  loadLogisticKeySetupState,
  logisticKeyReturnPath,
} from '../lib/logistic-key-setup-flow.mjs';
import { normalizeTenantLogisticKeySetting } from '../lib/logistic-key-response.mjs';
import { parseHttpJson } from '../lib/http-json.mjs';

for (const [body, status] of [['', 200], ['', 204], ['   \n\t', 200], ['null', 200]])
  assert.equal(await parseHttpJson(new Response(body || null, { status })), null);
assert.deepEqual(await parseHttpJson(new Response('[]')), []);
assert.deepEqual(await parseHttpJson(new Response('{}')), {});
await assert.rejects(() => parseHttpJson(new Response('{invalid')), /JSON inválido/);

async function setupResponse(response) {
  const body = await parseHttpJson(response);
  if (!response.ok) {
    const message = body && typeof body === 'object' && !Array.isArray(body) ? body.message : undefined;
    throw new Error(message ?? 'Falha ao configurar a chave logística.');
  }
  return normalizeTenantLogisticKeySetting(body);
}
await assert.rejects(() => setupResponse(new Response('{"message":"x"}', { status: 400 })), /^Error: x$/);
await assert.rejects(() => setupResponse(new Response(null, { status: 500 })), /Falha ao configurar/);
assert.equal(await setupResponse(new Response(null)), null);
assert.equal(await setupResponse(new Response('null')), null);
assert.equal(await setupResponse(new Response('[]')), null);
assert.deepEqual(await setupResponse(new Response(JSON.stringify({ tenant_id: 'tenant-a', primary_logistic_key: 'delivery_number', established_by_data_source_id: null, established_at: '2026-08-20T00:00:00.000Z' }))), { tenant_id: 'tenant-a', primary_logistic_key: 'delivery_number', established_by_data_source_id: null, established_at: '2026-08-20T00:00:00.000Z' });
for (const invalidBody of ['{}', JSON.stringify({ data: { tenant_id: 'tenant-a' } }), '{invalid'])
  await assert.rejects(() => setupResponse(new Response(invalidBody)), /Resposta inválida|JSON inválido/);

const setting = { tenant_id: 'tenant-a', primary_logistic_key: 'delivery_number', established_by_data_source_id: null, established_at: '2026-08-20T00:00:00.000Z' };
assert.deepEqual(normalizeTenantLogisticKeySetting(setting), setting);
assert.deepEqual(normalizeTenantLogisticKeySetting([setting]), setting);
assert.equal(normalizeTenantLogisticKeySetting([]), null);
assert.equal(normalizeTenantLogisticKeySetting(null), null);
for (const invalidResponse of [undefined, {}, { data: setting }, [null], [setting, setting], { ...setting, primary_logistic_key: 'invalid' }])
  assert.throws(() => normalizeTenantLogisticKeySetting(invalidResponse), /Resposta inválida/);

const sourceId = '23be45f9-7922-4c81-addf-0b132f63b242';
const expected = `/app/integrations/${sourceId}/setup?apiPhase=mapping`;
assert.equal(logisticKeyReturnPath(sourceId), expected);
for (const invalid of [undefined, '', 'invalid', 'https://site-externo.com', '//site-externo.com', '/app/../admin', '%252e%252e', '\\app\\admin', `${sourceId}\n`, `${sourceId}\r`, `${sourceId}\t`, `${sourceId}\0`])
  assert.equal(logisticKeyReturnPath(invalid), '/app/integrations', `invalid sourceId accepted: ${String(invalid)}`);

function client({ authError = null, profileError = null, user = { id: 'user-a' }, profile = { active_tenant_id: 'tenant-a' } } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: authError }) },
    from: () => ({
      select() { return this; },
      eq() { return this; },
      maybeSingle: async () => ({ data: profile, error: profileError }),
    }),
  };
}

await assert.rejects(() => getStrictLogisticKeySetupContext(client({ authError: new Error('auth unavailable') })), /Falha ao autenticar o usuário/);
await assert.rejects(() => getStrictLogisticKeySetupContext(client({ profileError: new Error('RLS denied') })), /Falha ao consultar a empresa ativa/);
assert.deepEqual(await getStrictLogisticKeySetupContext(client({ user: null })), { user: null, tenantId: null });
assert.equal((await getStrictLogisticKeySetupContext(client({ profile: null }))).tenantId, null);

const context = async () => ({ user: { id: 'user-a' }, tenantId: 'tenant-a' });
assert.equal((await loadLogisticKeySetupState(context, async () => null)).state, 'unset');
assert.equal((await loadLogisticKeySetupState(context, async () => setting)).state, 'configured');
assert.equal((await loadLogisticKeySetupState(context, async () => { throw new Error('Resposta inválida'); })).state, 'error');
assert.equal((await loadLogisticKeySetupState(context, async () => { throw Object.assign(new Error('forbidden'), { status: 403 }); })).state, 'forbidden');
assert.equal((await loadLogisticKeySetupState(async () => { throw new Error('auth unavailable'); }, async () => null)).state, 'error');
assert.equal((await loadLogisticKeySetupState(async () => { throw new Error('RLS denied'); }, async () => null)).state, 'error');

const panel = readFileSync(new URL('../components/integrations/api-connection-panel.tsx', import.meta.url), 'utf8');
assert.match(panel, /sourceId=\$\{encodeURIComponent\(sourceId\)\}/);
assert.doesNotMatch(panel, /returnTo=/);
assert.match(panel, /validInitialPhase\(initialPhase\)/);
assert.match(panel, /\[tenantId, sourceId, initialPhase\]/);
assert.match(panel, /logisticSettingStatus === 'error' \? 'indisponível'/);
assert.match(panel, /logisticSettingStatus === 'ready' && !logisticSetting/);
assert.match(panel, /Documento da entrega/);
const mainPanelLoad = panel.match(/const \[current, history, mappings, ignored, values, formats, targets\] = await Promise\.all\(\[([\s\S]*?)\]\);/)?.[1];
assert.ok(mainPanelLoad, 'main panel load was not found');
assert.doesNotMatch(mainPanelLoad, /getPrimaryLogisticKey/, 'official key lookup must not be part of the main Promise.all');
for (const assignment of ['setCanonicalTargets(targets)', 'setApiMappings(mappings)', 'setConfig(current)', 'setRuns(history)', 'setValueMappings(values)', 'setFormatDraft(', 'setDraft('])
  assert.ok(panel.indexOf(assignment) > -1 && panel.indexOf(assignment) < panel.indexOf('const setting = await getPrimaryLogisticKey'), `${assignment} must run before the isolated key lookup`);
assert.match(panel, /catch \(error\) \{[\s\S]*setLogisticSettingError\([\s\S]*setLogisticSettingStatus\('error'\)/);
assert.match(panel, /setLogisticSetting\(setting\);\s*setLogisticSettingStatus\('ready'\)/);

const api = readFileSync(new URL('../lib/api-connector-api.ts', import.meta.url), 'utf8');
assert.match(api, /primary-logistic-key`, undefined, true\)/);
assert.doesNotMatch(api, /primary-logistic-key[^;]+method:/s, 'a leitura da chave não pode escrever configuração');

const setupApi = readFileSync(new URL('../lib/setup-api.ts', import.meta.url), 'utf8');
assert.match(setupApi, /import \{ normalizeTenantLogisticKeySetting \} from '\.\/logistic-key-response\.mjs';/);
assert.match(setupApi, /getSetupLogisticKey[\s\S]*?setupApi<unknown>\([\s\S]*?normalizeTenantLogisticKeySetting\(response\)/);
assert.doesNotMatch(setupApi, /getSetupLogisticKey[\s\S]*?setupApi<TenantLogisticKeySetting \| null>/);

console.log('logistic key return and setup state tests passed');
