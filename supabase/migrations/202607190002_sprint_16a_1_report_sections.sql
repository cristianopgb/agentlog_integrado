create table public.report_sections (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 report_definition_id uuid not null references public.report_definitions(id) on delete cascade,
 title text not null, description text null, position_order integer not null default 0,
 ai_enabled boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.report_blocks add column report_section_id uuid null references public.report_sections(id) on delete cascade;
alter table public.report_blocks add column position_order integer not null default 0;
insert into public.report_sections (tenant_id,report_definition_id,title,description,position_order)
select r.tenant_id,r.id,'Resumo do relatório','Seção criada automaticamente para organizar os blocos existentes.',0 from public.report_definitions r;
update public.report_blocks b set report_section_id=s.id, position_order=coalesce((b.position->>'order')::integer,0)
from public.report_sections s where s.report_definition_id=b.report_definition_id and s.tenant_id=b.tenant_id;
create index report_sections_tenant_report_position_idx on public.report_sections(tenant_id,report_definition_id,position_order);
create index report_blocks_tenant_report_section_position_idx on public.report_blocks(tenant_id,report_definition_id,report_section_id,position_order);
alter table public.report_sections enable row level security;
create policy "tenant members report_sections" on public.report_sections for all to authenticated using (public.is_member_of_tenant(tenant_id)) with check (public.is_member_of_tenant(tenant_id));
