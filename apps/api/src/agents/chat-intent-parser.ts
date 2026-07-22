<<<<<<< HEAD
export type OperationalFilters={status?:string;customer_name?:string;driver_name?:string;vehicle_plate?:string;shipper_name?:string};
export type ChatRoute='knowledge_search'|'operational_search'|'indicator_query'|'dashboard_context'|'report_context'|'fallback';
export type ChatIntent={route:ChatRoute;identifier?:string;filters?:OperationalFilters;summary?:boolean};
const dashboard=/\b(dashboard|painel|an[aá]lise do dashboard|dashboard atual|[uú]ltimo dashboard)\b/i,report=/\b(relat[oó]rio|conclus[aã]o do relat[oó]rio|pontos de aten[cç][aã]o do relat[oó]rio|[uú]ltimo relat[oó]rio)\b/i,knowledge=/\b(manual|processo|procedimento|tela|menu|regra|uso do sistema|configura[cç][aã]o|como (usar|configurar)|base de conhecimento)\b/i,analytical=/\b(total|m[eé]dia|ranking|maior|menor|percentual|r\$\s*\/?\s*ton|frete por|peso por|mais entregas|menos peso|performance|entregas por status)\b/i,operational=/\b(entrega|\bnf\b|nota fiscal|\bct-?e\b|\bcte\b|manifesto|pedido|c[oó]digo operacional|placa|motorista|cliente|embarcador|status|canceled|cancelad[ao]|delayed|atrasad[ao]|delivered|entregue|realizada|conclu[ií]da|pending|pendente|in_transit|em tr[aâ]nsito)\b/i;
function status(text:string){if(/\b(canceled|cancelad[ao])\b/i.test(text))return'canceled';if(/\b(delayed|atrasad[ao])\b/i.test(text))return'delayed';if(/\b(delivered|entregue|realizada|conclu[ií]da)\b/i.test(text))return'delivered';if(/\b(pending|pendente)\b/i.test(text))return'pending';if(/\b(in_transit|em tr[aâ]nsito)\b/i.test(text))return'in_transit'}
function named(text:string,label:string){const match=text.match(new RegExp(`\\b${label}\\s+([\\p{L}][\\p{L}\\s'.-]{1,80}?)(?=\\s+(?:resuma|resumo|informa[cç][oõ]es|n[uú]meros|situa[cç][aã]o|como est[aá]|quantas|qual|e\\s|$)|[?.!,;:]|$)`,'iu'));return match?.[1]?.trim()}
function identifier(message:string){const code=message.match(/\b(?:ENT-?(?:\d{4}-)?\d+|NF-?\d+|CTE?-?\d+|MAN-?\d+|PED-?\d+)\b/i);if(code)return code[0];const numbered=message.match(/\b(?:entrega|nf|nota fiscal|ct-?e|cte|manifesto|pedido)\s*(?:n[ºo.]?\s*)?(\d+)\b/i);if(numbered)return numbered[1]}
export function parseChatIntent(message:string):ChatIntent{if(dashboard.test(message))return{route:'dashboard_context'};if(report.test(message))return{route:'report_context'};if(analytical.test(message))return{route:'indicator_query'};const filters:OperationalFilters={},driver=named(message,'motorista'),customer=named(message,'cliente'),shipper=named(message,'embarcador'),plate=message.match(/\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\b/i),state=status(message);if(driver)filters.driver_name=driver;if(customer)filters.customer_name=customer;if(shipper)filters.shipper_name=shipper;if(plate)filters.vehicle_plate=plate[0].toUpperCase();if(state)filters.status=state;const code=identifier(message);if(code||Object.keys(filters).length||operational.test(message))return{route:'operational_search',identifier:code,filters:Object.keys(filters).length?filters:undefined,summary:Boolean(Object.keys(filters).length)};if(knowledge.test(message))return{route:'knowledge_search'};return{route:'fallback'}}
=======
export type ChatRoute = 'knowledge_search'|'operational_search'|'indicator_query'|'dashboard_context'|'report_context'|'fallback';
export type ChatIntent = { route:ChatRoute; identifier?:string };

const dashboard = /\b(dashboard|painel|an[aá]lise do dashboard|dashboard atual|[uú]ltimo dashboard)\b/i;
const report = /\b(relat[oó]rio|conclus[aã]o do relat[oó]rio|pontos de aten[cç][aã]o do relat[oó]rio|[uú]ltimo relat[oó]rio)\b/i;
const knowledge = /\b(manual|processo|procedimento|tela|menu|regra|uso do sistema|configura[cç][aã]o|como (usar|configurar)|base de conhecimento)\b/i;
const analytical = /\b(total|m[eé]dia|ranking|maior|menor|percentual|r\$\s*\/?\s*ton|frete por|peso por|mais entregas|menos peso|performance|entregas por status)\b/i;
const operational = /\b(entrega|\bnf\b|nota fiscal|\bct-?e\b|\bcte\b|manifesto|pedido|c[oó]digo operacional|placa|motorista|cliente|embarcador|status)\b/i;

function identifier(message:string){
  const code=message.match(/\b(?:ENT-?(?:\d{4}-)?\d+|NF-?\d+|CTE?-?\d+|MAN-?\d+|PED-?\d+)\b/i);
  if(code)return code[0];
  const numbered=message.match(/\b(?:entrega|nf|nota fiscal|ct-?e|cte|manifesto|pedido)\s*(?:n[ºo.]?\s*)?(\d+)\b/i);
  if(numbered)return numbered[1];
  const plate=message.match(/\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\b/i);
  if(plate)return plate[0];
  const named=message.match(/\b(?:motorista|cliente|embarcador)\s+([\p{L}][\p{L}\s'.-]{1,80})/iu);
  return named?.[1]?.trim().replace(/[?.!,;:]+$/,'');
}

/** Routes Chat Geral to a published source; it never plans or calculates analytics. */
export function parseChatIntent(message:string):ChatIntent {
  if(dashboard.test(message))return {route:'dashboard_context'};
  if(report.test(message))return {route:'report_context'};
  if(analytical.test(message))return {route:'indicator_query'};
  const value=identifier(message);
  if(value||operational.test(message))return {route:'operational_search',identifier:value};
  if(knowledge.test(message))return {route:'knowledge_search'};
  return {route:'fallback'};
}
>>>>>>> origin/main
