import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [createPage,editPage,listPage]=await Promise.all([
  readFile(new URL('../app/app/setup/agents/new/page.tsx',import.meta.url),'utf8'),
  readFile(new URL('../app/app/setup/agents/[id]/page.tsx',import.meta.url),'utf8'),
  readFile(new URL('../app/app/setup/agents/page.tsx',import.meta.url),'utf8'),
]);

for(const source of [createPage,editPage,listPage]){
  assert.match(source,/attendance_inbox/);
  assert.match(source,/Atendimento \/ Inbox/);
}
assert.match(createPage,/module_key:'atendimento'/);
assert.match(createPage,/public_chat e ocorrências/);
assert.match(editPage,/\['atendimento','Atendimento'\]/);
assert.match(editPage,/Configurar \{typeLabels\[agent\.agent_type\]\}/);
assert.match(listPage,/\{label\[x\.agent_type\]\} · \{label\[x\.status\]/);
console.log('agents-ui.local-test: ok');
