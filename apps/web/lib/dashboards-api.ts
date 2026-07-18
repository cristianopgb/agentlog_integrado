const tokenKey = 'sli_supabase_access_token';
function getApiBase() { const configured = process.env.NEXT_PUBLIC_API_URL; if (configured) return configured.replace(/\/$/, ''); if (process.env.NODE_ENV === 'production') throw new Error('API backend não configurada.'); return 'http://localhost:3001'; }
async function api<T>(path:string, init?:RequestInit):Promise<T>{ const token=window.localStorage.getItem(tokenKey); const r=await fetch(`${getApiBase()}${path}`,{...init,headers:{Authorization:token?`Bearer ${token}`:'','Content-Type':'application/json',...(init?.headers??{})}}); const text=await r.text(); const body=text?JSON.parse(text):null; if(!r.ok) throw new Error(body?.message??'Falha em dashboards.'); return body as T; }
export type VisualType='kpi'|'table'|'matrix'|'bar'|'pie'|'line';
export type Dashboard={id:string;tenant_id:string;title:string;description:string|null;status:'draft'|'published'|'archived';published_version_id?:string|null;layout_config?:Record<string,unknown>;widgets?:Widget[];filters?:DashboardFilter[]};
export type Widget={id:string;dashboard_id:string;indicator_source:'native'|'custom';indicator_id:string;title:string;visual_type:VisualType;position:{x:number;y:number;w:number;h:number};properties:Record<string,unknown>};
export type DashboardFilter={id:string;field_key:string;label:string;operator:string;value:unknown};
export function listDashboards(t:string){return api<{data:Dashboard[]}>(`/tenants/${t}/dashboards`)}
export function createDashboard(t:string,p:Record<string,unknown>){return api<Dashboard>(`/tenants/${t}/dashboards`,{method:'POST',body:JSON.stringify(p)})}
export function getDashboard(t:string,id:string){return api<Dashboard>(`/tenants/${t}/dashboards/${id}`)}
export function updateDashboard(t:string,id:string,p:Record<string,unknown>){return api<Dashboard>(`/tenants/${t}/dashboards/${id}`,{method:'PATCH',body:JSON.stringify(p)})}
export function addWidget(t:string,id:string,p:Record<string,unknown>){return api<Widget>(`/tenants/${t}/dashboards/${id}/widgets`,{method:'POST',body:JSON.stringify(p)})}
export function updateWidget(t:string,id:string,w:string,p:Record<string,unknown>){return api<Widget>(`/tenants/${t}/dashboards/${id}/widgets/${w}`,{method:'PATCH',body:JSON.stringify(p)})}
export function deleteWidget(t:string,id:string,w:string){return api<Widget>(`/tenants/${t}/dashboards/${id}/widgets/${w}`,{method:'DELETE'})}
export function previewDashboard(t:string,id:string,filters:Record<string,unknown>[] = [],published=false){return api<{data:Array<{widget_id:string;result:unknown}>}>(`/tenants/${t}/dashboards/${id}/preview`,{method:'POST',body:JSON.stringify({filters,published})})}
export function publishDashboard(t:string,id:string){return api(`/tenants/${t}/dashboards/${id}/publish`,{method:'POST'})}
export function getPublishedDashboard(t:string,id:string){return api<{snapshot:Dashboard}>(`/tenants/${t}/dashboards/${id}/published`)}
