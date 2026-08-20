import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getStrictLogisticKeySetupContext,
  loadLogisticKeySetupState,
  logisticKeyReturnPath,
} from '../lib/logistic-key-setup-flow.mjs';

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
assert.equal((await loadLogisticKeySetupState(context, async () => ({ primary_logistic_key: 'delivery_number' }))).state, 'configured');
assert.equal((await loadLogisticKeySetupState(context, async () => { throw Object.assign(new Error('forbidden'), { status: 403 }); })).state, 'forbidden');
assert.equal((await loadLogisticKeySetupState(async () => { throw new Error('auth unavailable'); }, async () => null)).state, 'error');
assert.equal((await loadLogisticKeySetupState(async () => { throw new Error('RLS denied'); }, async () => null)).state, 'error');

const panel = readFileSync(new URL('../components/integrations/api-connection-panel.tsx', import.meta.url), 'utf8');
assert.match(panel, /sourceId=\$\{encodeURIComponent\(sourceId\)\}/);
assert.doesNotMatch(panel, /returnTo=/);
assert.match(panel, /validInitialPhase\(initialPhase\)/);

console.log('logistic key return and setup state tests passed');
