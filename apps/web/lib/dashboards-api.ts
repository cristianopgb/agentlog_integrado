const tokenKey = 'sli_supabase_access_token';
function getApiBase() { const configured = process.env.NEXT_PUBLIC_API_URL; if (configured) return configured.replace(/\/$/, ''); if (process.env.NODE_ENV === 'production') throw new Error('API backend não configurada.'); return 'http://localhost:3001'; }
async function api<T>(path:string, init?:RequestInit):Promise<T>{ const token=window.localStorage.getItem(tokenKey); const r=await fetch(`${getApiBase()}${path}`,{...init,headers:{Authorization:token?`Bearer ${token}`:'','Content-Type':'application/json',...(init?.headers??{})}}); const text=await r.text(); const body=text?JSON.parse(text):null; if(!r.ok) throw new Error(body?.message??'Falha em dashboards.'); return body as T; }
export type VisualType='kpi'|'table'|'matrix'|'bar'|'pie'|'line';
export type DashboardIndicator={id:string;source:'native'|'custom';name:string;result_shape:'scalar'|'table'|'matrix'|'distribution'|'ranking'|'timeseries'|'empty';allowed_visual_types:VisualType[];recommended_visual_type:VisualType;compatibility_reason:string};
export type Dashboard={id:string;tenant_id:string;title:string;description:string|null;status:'draft'|'published'|'archived';published_version_id?:string|null;layout_config?:Record<string,unknown>;widgets?:Widget[];filters?:DashboardFilter[]};
export type Widget={id:string;dashboard_id:string;indicator_source:'native'|'custom';indicator_id:string;title:string;visual_type:VisualType;position:{x:number;y:number;w:number;h:number};properties:Record<string,unknown>};
export type DashboardFilter={id:string;field_key:string;label:string;operator:string;value:unknown};
export type DashboardNativeFilter={key:string;label:string;group:'Período'|'Entidades'|'Localidade'|'Operação';type:'date_range'|'multi_select';field_key:string;available:boolean;reason?:string;options:Array<{label:string;value:string}>;placeholder:string};
export type DashboardRuntimeFilter={key:string;type:'date_range';from?:string;to?:string}|{key:string;type:'multi_select';values:string[]};
export function listDashboards(t:string){return api<{data:Dashboard[]}>(`/tenants/${t}/dashboards`)}
export function createDashboard(t:string,p:Record<string,unknown>){return api<Dashboard>(`/tenants/${t}/dashboards`,{method:'POST',body:JSON.stringify(p)})}
export function archiveDashboard(t:string,id:string){return api<Dashboard>(`/tenants/${t}/dashboards/${id}`,{method:'DELETE'})}
export function getDashboard(t:string,id:string){return api<Dashboard>(`/tenants/${t}/dashboards/${id}`)}
export function listDashboardNativeFilters(t:string){return api<{data:DashboardNativeFilter[]}>(`/tenants/${t}/dashboards/native-filters`)}
export function listDashboardIndicators(t:string){return api<{data:DashboardIndicator[]}>(`/tenants/${t}/dashboards/indicator-library`)}
export function updateDashboard(t:string,id:string,p:Record<string,unknown>){return api<Dashboard>(`/tenants/${t}/dashboards/${id}`,{method:'PATCH',body:JSON.stringify(p)})}
export function addWidget(t:string,id:string,p:Record<string,unknown>){return api<Widget>(`/tenants/${t}/dashboards/${id}/widgets`,{method:'POST',body:JSON.stringify(p)})}
export function updateWidget(t:string,id:string,w:string,p:Record<string,unknown>){return api<Widget>(`/tenants/${t}/dashboards/${id}/widgets/${w}`,{method:'PATCH',body:JSON.stringify(p)})}
export function deleteWidget(t:string,id:string,w:string){return api<Widget>(`/tenants/${t}/dashboards/${id}/widgets/${w}`,{method:'DELETE'})}
export function previewDashboard(t:string,id:string,filters:DashboardRuntimeFilter[] = [],published=false){return api<{data:Array<{widget_id:string;result:unknown}>}>(`/tenants/${t}/dashboards/${id}/preview`,{method:'POST',body:JSON.stringify({filters,published})})}
export function publishDashboard(t:string,id:string){return api(`/tenants/${t}/dashboards/${id}/publish`,{method:'POST'})}
export function getPublishedDashboard(t:string,id:string){return api<{snapshot:Dashboard}>(`/tenants/${t}/dashboards/${id}/published`)}
export type DashboardAnalysis={opening:string;executive_summary:string;highlights:string[];attention_points:string[];risks:string[];recommendations:string[];widget_insights:Array<{widget_id:string;widget_title:string;analysis:string}>;data_quality_notes:string[]};
export function dashboardAiAnalysis(t:string,id:string,filters:DashboardRuntimeFilter[]){return api<{analysis:DashboardAnalysis|null;message?:string;dry_run:boolean;ai_run_id?:string;insight_id?:string;generated_at:string}>(`/tenants/${t}/dashboards/${id}/ai-analysis`,{method:'POST',body:JSON.stringify({filters})})}
export function dashboardAiQuestion(t:string,id:string,filters:DashboardRuntimeFilter[],question:string){return api<{answer:string;dry_run:boolean;ai_run_id?:string;generated_at:string}>(`/tenants/${t}/dashboards/${id}/ai-question`,{method:'POST',body:JSON.stringify({filters,question})})}
export function dashboardAiSpeech(t:string,id:string,text:string,ai_run_id?:string){return api<{audio_base64?:string;audio_mime_type?:string;dry_run:boolean;message?:string}>(`/tenants/${t}/dashboards/${id}/ai-speech`,{method:'POST',body:JSON.stringify({text,ai_run_id})})}
export type RealtimeSession={enabled:boolean;reason?:string;session?:{client_secret:string;expires_at:string|null;model:string};snapshot_context_id?:string};
export function dashboardAiRealtimeSession(t:string,id:string,filters:DashboardRuntimeFilter[]){return api<RealtimeSession>(`/tenants/${t}/dashboards/${id}/ai-realtime-session`,{method:'POST',body:JSON.stringify({filters})})}
