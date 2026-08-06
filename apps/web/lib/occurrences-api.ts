const tokenKey='sli_supabase_access_token';
const base=()=>process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/,'')??'http://localhost:3001';
async function api<T>(path:string,init:RequestInit={}){const response=await fetch(`${base()}${path}`,{...init,headers:{Authorization:`Bearer ${localStorage.getItem(tokenKey)??''}`,'Content-Type':'application/json',...init.headers}});const data=await response.json().catch(()=>null) as {message?:string}|null;if(!response.ok)throw new Error(data?.message??'Não foi possível concluir a operação.');return data as T;}
export type OperationLink={id:string;operation_record_id:string;is_primary:boolean;relationship_type:string;snapshot?:Record<string,unknown>};
export type OccurrenceEvent={id:string;event_type:string;event_title:string|null;event_description:string|null;event_at:string;old_status:string|null;new_status:string|null};
export type Occurrence={id:string;occurrence_number:string;title:string;description:string|null;current_status:string;current_priority:string;source_channel:string;current_owner_id:string|null;opened_at:string;operation_links?:OperationLink[];events?:OccurrenceEvent[]};
export const listOccurrences=(tenant:string,params=new URLSearchParams())=>api<Occurrence[]>(`/tenants/${tenant}/occurrences?${params}`);
export const occurrenceDetail=(tenant:string,id:string)=>api<Occurrence>(`/tenants/${tenant}/occurrences/${id}`);
export const occurrenceKanban=(tenant:string)=>api<Array<{status:string;items:Occurrence[]}>>(`/tenants/${tenant}/occurrences/kanban`);
export const changeOccurrenceStatus=(tenant:string,id:string,status:string)=>api<Occurrence>(`/tenants/${tenant}/occurrences/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});
export const assignOccurrence=(tenant:string,id:string,owner_id:string|null)=>api<Occurrence>(`/tenants/${tenant}/occurrences/${id}/assign`,{method:'PATCH',body:JSON.stringify({owner_id})});
export const addOccurrenceEvent=(tenant:string,id:string,event_description:string)=>api<OccurrenceEvent[]>(`/tenants/${tenant}/occurrences/${id}/events`,{method:'POST',body:JSON.stringify({event_type:'note',event_title:'Atualização operacional',event_description})});
