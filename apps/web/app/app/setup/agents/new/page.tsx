/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import {Suspense,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {createAgent} from '../../../../../lib/agents-api';
import {createBrowserSupabaseClient} from '../../../../../lib/supabase';

const typeOptions=[['dashboard_analyst','Agente de Dashboard'],['report_writer','Agente de Relatório'],['general_chat','Chat Geral'],['attendance_inbox','Atendimento / Inbox'],['financial','Financeiro'],['transport','Transporte'],['warehouse','Armazém'],['teams','Equipes'],['saas_admin','SaaSAdmin'],['setup_dev','SetupDev']];
const modules=[['core','Core'],['transport','Transporte'],['finance','Financeiro'],['atendimento','Atendimento'],['warehouse','Armazém'],['team','Equipes']];
const allowedModules:Record<string,string[]>={dashboard_analyst:['core','transport','finance','warehouse','team'],report_writer:['core','transport','finance','warehouse','team'],general_chat:['core'],attendance_inbox:['atendimento'],financial:['finance'],transport:['transport'],warehouse:['warehouse'],teams:['team'],saas_admin:['core'],setup_dev:['core']};
const defaultModules:Record<string,string>={dashboard_analyst:'core',report_writer:'core',general_chat:'core',attendance_inbox:'atendimento',financial:'finance',transport:'transport',warehouse:'warehouse',teams:'team',saas_admin:'core',setup_dev:'core'};
const models=[['','Padrão do sistema'],['gpt-4.1-mini','gpt-4.1-mini'],['gpt-4.1','gpt-4.1']];

function NewAgentForm(){
  const router=useRouter(),searchParams=useSearchParams();
  const initialType=searchParams.get('type')==='attendance_inbox'?'attendance_inbox':'dashboard_analyst';
  const[q,setQ]=useState<any>({agent_type:initialType,name:'',status:'draft',module_key:defaultModules[initialType],model_name:'',temperature:.2,max_output_tokens:1200}),[error,setError]=useState('');
  const availableModules=modules.filter(([key])=>allowedModules[q.agent_type]?.includes(key));
  const field=(key:string,label:string,area=false)=><label className="block" key={key}>{label}{area?<textarea className="w-full rounded border p-2" value={q[key]||''} onChange={event=>setQ({...q,[key]:event.target.value})}/>:<input className="w-full rounded border p-2" value={q[key]||''} onChange={event=>setQ({...q,[key]:event.target.value})}/>}</label>;
  return <form className="mx-auto max-w-xl space-y-3 rounded-xl border bg-white p-6" onSubmit={async event=>{event.preventDefault();try{const{data}:any=await createBrowserSupabaseClient().from('users_profile').select('active_tenant_id').maybeSingle();router.push(`/app/setup/agents/${(await createAgent(data.active_tenant_id,q)).id}`)}catch(reason:any){setError(reason.message)}}}>
    <h1 className="text-2xl font-bold">Novo agente</h1>
    <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-900">Para Inbox e chat público, use Atendimento / Inbox.</p>
    {error&&<p className="text-red-700">{error}</p>}
    <label className="block">Tipo de agente<select className="w-full rounded border p-2" value={q.agent_type} onChange={event=>{const agent_type=event.target.value;setQ({...q,agent_type,module_key:defaultModules[agent_type]})}}>{typeOptions.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select>{q.agent_type==='attendance_inbox'&&<small className="block text-slate-600">Agente responsável por atendimento operacional, Inbox, public_chat e ocorrências.</small>}</label>
    {field('name','Nome')}{field('description','Descrição',true)}
    <label className="block">Módulo<select className="w-full rounded border p-2" value={q.module_key} disabled={availableModules.length===1} onChange={event=>setQ({...q,module_key:event.target.value})}>{availableModules.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label>Status inicial<select value={q.status} onChange={event=>setQ({...q,status:event.target.value})}><option value="draft">Rascunho</option><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
    <label>Modelo<select value={q.model_name} onChange={event=>setQ({...q,model_name:event.target.value})}>{models.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label>Temperatura<input type="number" min="0" max="2" step=".1" value={q.temperature} onChange={event=>setQ({...q,temperature:+event.target.value})}/></label>
    <label>Máximo de tokens<input type="number" min="100" max="8000" value={q.max_output_tokens} onChange={event=>setQ({...q,max_output_tokens:+event.target.value})}/></label>
    {field('behavior_profile','Perfil de comportamento')}{field('system_instructions','Instruções do sistema',true)}
    <button className="rounded bg-blue-600 px-4 py-2 text-white">Criar rascunho</button>
  </form>;
}

export default function New(){return <Suspense fallback={<p>Carregando...</p>}><NewAgentForm/></Suspense>}
