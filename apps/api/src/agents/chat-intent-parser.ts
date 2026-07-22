export type OperationalFilters={status?:string;customer_name?:string;driver_name?:string;vehicle_plate?:string;shipper_name?:string;origin_state?:string;destination_state?:string};
export type ChatRoute='knowledge_search'|'operational_search'|'indicator_query'|'dashboard_context'|'report_context'|'fallback';
export type ChatIntent={route:ChatRoute;identifier?:string;filters?:OperationalFilters;summary?:boolean};

const analytical=/\b(peso|kg|carga|frete|receita|valor frete|volume|entregas|registros|maior|menor|mais|menos|ranking|total|percentual|r\$\s*\/?\s*ton|tonelada)\b/i;
const dashboard=/\b(dashboard|painel|an[aá]lise do dashboard|dashboard atual|[uú]ltimo dashboard)\b/i,report=/\b(relat[oó]rio|conclus[aã]o do relat[oó]rio|pontos de aten[cç][aã]o do relat[oó]rio|[uú]ltimo relat[oó]rio)\b/i,knowledge=/\b(manual|processo|procedimento|tela|menu|regra|uso do sistema|configura[cç][aã]o|como (usar|configurar)|base de conhecimento)\b/i;
const states=new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);

function status(text:string){if(/\b(canceled|cancelad[ao])\b/i.test(text))return'canceled';if(/\b(delayed|atrasad[ao])\b/i.test(text))return'delayed';if(/\b(delivered|entregue|realizada|conclu[ií]da)\b/i.test(text))return'delivered';if(/\b(pending|pendente)\b/i.test(text))return'pending';if(/\b(in_transit|em tr[aâ]nsito)\b/i.test(text))return'in_transit'}
function title(value:string){return value.trim().replace(/\s+/g,' ').replace(/\b\p{L}/gu,char=>char.toLocaleUpperCase('pt-BR'))}
function named(text:string,label:string){const match=text.match(new RegExp(`\\b${label}\\s+([\\p{L}][\\p{L}\\s'.-]{1,80}?)(?=\\s+(?:resuma|resumo|informa[cç][oõ]es|n[uú]meros|situa[cç][aã]o|como est[aá]|quantas|qual|quais|fez|no|na|em|para|origem|destino|e\\s+quais|$)|[?.!,;:]|$)`,'iu'));return match?.[1]?.trim()}
function customer(text:string){return named(text,'(?:cliente|clienye|client)')||text.match(/\b(?:resuma|resumo)\s+(?:os\s+)?dados\s+do\s+([\p{L}][\p{L}\s'.-]{1,80}?)(?=[?.!,;:]|$)/iu)?.[1]?.trim()}
function identifier(message:string){const code=message.match(/\b(?:ENT-?(?:\d{4}-)?\d+|NF-?\d+|CTE?-?\d+|MAN-?\d+|PED-?\d+)\b/i);if(code)return code[0];const numbered=message.match(/\b(?:entrega|nf|nota fiscal|ct-?e|cte|manifesto|pedido)\s*(?:n[ºo.]?\s*)?(\d+)\b/i);if(numbered)return numbered[1]}
function stateFilters(message:string,filters:OperationalFilters){const matches=[...message.matchAll(/\b(?:no|na|ni|em|para|destino|origem|saindo do|carregado no)\s+(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/gi)];for(const match of matches){const state=match[1].toUpperCase();if(!states.has(state))continue;if(/origem|saindo do|carregado no/i.test(match[0]))filters.origin_state=state;else filters.destination_state=state}}

export function parseChatIntent(message:string):ChatIntent{
  if(dashboard.test(message))return{route:'dashboard_context'};
  if(report.test(message))return{route:'report_context'};
  if(knowledge.test(message))return{route:'knowledge_search'};
  const filters:OperationalFilters={},driver=named(message,'motorista'),customerName=customer(message),shipper=named(message,'embarcador'),plate=message.match(/\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\b/i),knownStatus=status(message);
  if(driver)filters.driver_name=title(driver);if(customerName)filters.customer_name=title(customerName);if(shipper)filters.shipper_name=title(shipper);if(plate)filters.vehicle_plate=plate[0].toUpperCase();if(knownStatus)filters.status=knownStatus;stateFilters(message,filters);
  const code=identifier(message);
  if(code||Object.keys(filters).length)return{route:'operational_search',identifier:code,filters:Object.keys(filters).length?filters:undefined,summary:true};
  if(analytical.test(message))return{route:'indicator_query'};
  return{route:'fallback'};
}
