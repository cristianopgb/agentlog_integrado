export type ChatIntent={tool?:'knowledge_base.search'|'treated_data.search_records'|'treated_data.aggregate_records'|'treated_data.get_summary'|'indicators.get_result';input?:Record<string,unknown>;needsClarification?:boolean};
type HistoryItem={role:string;content:string};
const iso=(d:Date)=>d.toISOString().slice(0,10);
function period(text:string,now=new Date()){const end=iso(now),start=new Date(now);if(/hoje/.test(text))return{start:end,end};if(/últimos? 7 dias/.test(text)){start.setDate(start.getDate()-6);return{start:iso(start),end}}if(/últimos? 30 dias/.test(text)){start.setDate(start.getDate()-29);return{start:iso(start),end}}if(/esta semana/.test(text)){start.setDate(start.getDate()-((start.getDay()+6)%7));return{start:iso(start),end}}if(/m[eê]s passado/.test(text)){start.setDate(0);const last=new Date(start);last.setDate(1);return{start:iso(last),end:iso(start)}}if(/este m[eê]s/.test(text)){start.setDate(1);return{start:iso(start),end}}}
const knowledgeTopic=/\b(manual|processo|procedimento|pol[ií]tica|regra|faq|telas?|funcionalidades?|sistema|m[oó]dulo|configura(?:ç|c)[aã]o|uso|dashboard|relat[oó]rio|indicador|agente|base de conhecimento|contrato de dados|staging|integra(?:ç|c)[aã]o|permiss[oõ]es|ocorr[eê]ncia|canhoto|faturamento)\b/i;
const operationalIdentifier=/(?:\bnf\b|nota fiscal|\bcte\b|manifesto|entrega)\s*(?:n[ºo.]?\s*)?[a-z0-9-]*\d[a-z0-9-]*/i;
const metricFor=(text:string)=>/frete|valor.*frete/.test(text)?'sum_freight':/peso|\bkg\b/.test(text)?'sum_weight':/volume/.test(text)?'volume_count':/\bcte\b/.test(text)?'cte_count':/entregas?|registros?/.test(text)?'deliveries_count':undefined;
const groupFor=(text:string)=>/por\s+(cliente|clientes)/.test(text)?'customer_name':/por\s+(motorista|motoristas)/.test(text)?'driver_name':/por\s+(uf|estado|estados)/.test(text)?'destination_state':'none';
function priorIntent(history:HistoryItem[]){return [...history].reverse().find(x=>x.role==='user'&&metricFor(x.content.toLowerCase()))?.content.toLowerCase()||''}
export function parseChatIntent(message:string,history:HistoryItem[]=[],now=new Date()):ChatIntent{
 const text=message.toLowerCase(); const previous=priorIntent(history); const followup=/^\s*(e\s+)?(o|os|a|as)?\s*(peso|frete|volumes?|entregas?|por cliente|por motorista|esse m[eê]s|m[eê]s passado)\??\s*$/i.test(message);
 if(/(que|quais).*(informa[cç][oõ]es|dados|campos|entidades).*(base|consultar)|quais dados posso consultar|campos existem/.test(text))return{tool:'treated_data.get_summary',input:{}};
 const m=message.match(/(?:nf|nota fiscal|cte|manifesto|entrega)\s*(?:n[ºo.]?\s*)?([a-z0-9-]*\d[a-z0-9-]*)/i);
 if(m&&operationalIdentifier.test(message))return{tool:'treated_data.search_records',input:{entity:'auto',identifier:m[1]}};
 const effective=followup?`${previous} ${text}`:text, metric=metricFor(effective);
 if(metric){const filters:Record<string,unknown>={};const range=period(text,now)||period(previous,now);if(range)filters.date_range=range;const group=groupFor(text)!=='none'?groupFor(text):groupFor(previous);return{tool:'treated_data.aggregate_records',input:{metric,filters,group_by:group,limit:10}}}
 if(/quantas|quantos|mais ocorr|total/.test(text)){return{tool:'treated_data.aggregate_records',input:{metric:'deliveries_count',filters:{},group_by:groupFor(text),limit:10}}}
 if(knowledgeTopic.test(message))return{tool:'knowledge_base.search',input:{query:message,scope:'all',limit:8}};
 return{};
}
