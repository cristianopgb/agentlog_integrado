export type ChatIntent={tool?:'knowledge_base.search'|'treated_data.search_records'|'treated_data.aggregate_records';input?:Record<string,unknown>;needsClarification?:boolean};

const iso=(date:Date)=>date.toISOString().slice(0,10);
function period(text:string,now=new Date()){const end=iso(now),start=new Date(now);if(/hoje/.test(text))return{start:end,end};if(/últimos? 7 dias/.test(text)){start.setDate(start.getDate()-6);return{start:iso(start),end}}if(/últimos? 30 dias/.test(text)){start.setDate(start.getDate()-29);return{start:iso(start),end}}if(/esta semana/.test(text)){start.setDate(start.getDate()-((start.getDay()+6)%7));return{start:iso(start),end}}if(/mês passado/.test(text)){start.setDate(0);const last=new Date(start);last.setDate(1);return{start:iso(last),end:iso(start)}}if(/este mês/.test(text)){start.setDate(1);return{start:iso(start),end}}return undefined}
const knowledgeTopic=/\b(manual|processo|procedimento|pol[ií]tica|regra|faq|telas?|funcionalidades?|sistema|m[oó]dulo|configura(?:ç|c)[aã]o|uso|dashboard|relat[oó]rio|indicador|agente|base de conhecimento|contrato de dados|staging|integra(?:ç|c)[aã]o|permiss[oõ]es|ocorr[eê]ncia|canhoto|faturamento)\b/i;
const operationalIdentifier=/(?:\bnf\b|nota fiscal|\bcte\b|manifesto|entrega)\s*(?:n[ºo.]?\s*)?[a-z0-9-]*\d[a-z0-9-]*/i;

export function parseChatIntent(message:string,now=new Date()):ChatIntent{
 const text=message.toLowerCase();
 // Identifiers and explicit aggregate questions are operational even when they contain words such as "entrega".
 const m=message.match(/(?:nf|nota fiscal|cte|manifesto|entrega)\s*(?:n[ºo.]?\s*)?([a-z0-9-]*\d[a-z0-9-]*)/i);
 if(m&&operationalIdentifier.test(message))return{tool:'treated_data.search_records',input:{entity:'auto',identifier:m[1]}};
 if(/quantas|quantos|mais ocorr|total/.test(text)){
  const filters:Record<string,unknown>={};const driver=message.match(/motorista\s+([\p{L}][\p{L}\s'.-]*?)(?=\s+(?:fez|tem|nos?|na|este|esta|hoje|últimos?|$))/iu)?.[1]?.trim();const customer=message.match(/cliente\s+([\p{L}][\p{L}\s'.-]*?)(?=\s+(?:teve|tem|nos?|na|este|esta|hoje|últimos?|$))/iu)?.[1]?.trim();const vehicle=message.match(/(?:veículo|placa)\s+([A-Z0-9-]{5,8})/i)?.[1];if(driver)filters.driver_name=driver;if(customer)filters.customer_name=customer;if(vehicle)filters.vehicle_plate=vehicle;if(/atrasad/.test(text))filters.status='atrasada';const range=period(text,now);if(range)filters.date_range=range;const metric=/ocorr/.test(text)?'occurrences_count':/cte/.test(text)?'cte_count':'deliveries_count';const group=/clientes?/.test(text)?'customer_name':/motoristas?/.test(text)?'driver_name':'none';if(/motorista|cliente|veículo|placa/.test(text)&&!driver&&!customer&&!vehicle)return{needsClarification:true};if(/motorista/.test(text)&&!driver)return{needsClarification:true};return{tool:'treated_data.aggregate_records',input:{metric,filters,group_by:group,limit:10}};
 }
 if(knowledgeTopic.test(message))return{tool:'knowledge_base.search',input:{query:message,scope:'all',limit:8}};
 return{};
}
