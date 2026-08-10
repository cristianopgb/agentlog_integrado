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
assert.match(createPage,/searchParams\.get\('type'\)==='attendance_inbox'/);
assert.match(createPage,/defaultModules\[initialType\]/);
assert.match(createPage,/attendance_inbox:\['atendimento'\]/);
assert.match(createPage,/dashboard_analyst:\['core','transport','finance','warehouse','team'\]/);
assert.match(createPage,/Para Inbox e chat público, use Atendimento \/ Inbox\./);
assert.match(createPage,/public_chat e ocorrências/);
assert.match(editPage,/incompatibleAttendance/);
assert.match(editPage,/Este agente está com tipo\/módulo incompatível\. Arquive e crie um novo Atendimento \/ Inbox\./);
assert.match(editPage,/Configurar \{typeLabels\[agent\.agent_type\]\}/);
assert.match(listPage,/\{label\[x\.agent_type\]\} · \{label\[x\.status\]/);
assert.match(listPage,/\/app\/setup\/agents\/new\?type=attendance_inbox/);
assert.match(listPage,/Novo Atendimento \/ Inbox/);
console.log('agents-ui.local-test: ok');
