-- Sprint 10R-D: structured transactional details for operational occurrences.
alter table public.occurrences add constraint occurrences_tenant_id_id_key unique (tenant_id,id);
alter table public.occurrence_events add constraint occurrence_events_tenant_id_id_key unique (tenant_id,id);
alter table public.operation_records add constraint operation_records_tenant_id_id_key unique (tenant_id,id);
create table if not exists public.occurrence_items (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), occurrence_id uuid not null references public.occurrences(id) on delete cascade,
 event_id uuid references public.occurrence_events(id), operation_record_id uuid references public.operation_records(id), item_type text not null,
 sku text, product_name text, quantity numeric, unit text, amount numeric, currency text not null default 'BRL', notes text, created_by uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 check(item_type in ('missing','extra','damaged','returned','inverted','divergent','other')), check(quantity is null or quantity>=0), check(amount is null or amount>=0)
);
create table if not exists public.occurrence_financial_entries (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), occurrence_id uuid not null references public.occurrences(id) on delete cascade,
 event_id uuid references public.occurrence_events(id), entry_type text not null, status text not null default 'requested', amount numeric not null, currency text not null default 'BRL',
 description text, requested_by uuid, authorized_by uuid, paid_at timestamptz, due_at timestamptz, receipt_document_id uuid, notes text, created_by uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 check(entry_type in ('unloading','daily','layover','helper','scheduling_fee','additional_fee','refund','return_cost','other')), check(status in ('requested','approved','rejected','paid','canceled')), check(amount>=0)
);
create table if not exists public.occurrence_documents (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), occurrence_id uuid not null references public.occurrences(id) on delete cascade,
 event_id uuid references public.occurrence_events(id), document_type text not null, document_number text, document_key text, amount numeric, issued_at timestamptz,
 storage_path text, external_url text, notes text, created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 check(document_type in ('original_invoice','return_invoice','cte','mdfe','proof_of_delivery','unloading_receipt','fiscal_document','occurrence_report','other')), check(amount is null or amount>=0)
);
alter table public.occurrence_financial_entries add constraint occurrence_financial_receipt_fkey foreign key(receipt_document_id) references public.occurrence_documents(id);
create table if not exists public.occurrence_attachments (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), occurrence_id uuid not null references public.occurrences(id) on delete cascade,
 event_id uuid references public.occurrence_events(id), document_id uuid references public.occurrence_documents(id), attachment_type text not null, file_name text, mime_type text,
 size_bytes bigint, storage_path text, external_url text, description text, created_by uuid, created_at timestamptz not null default now(), deleted_at timestamptz,
 check(attachment_type in ('photo','audio','video','pdf','image','document','other')), check(size_bytes is null or size_bytes>=0)
);
alter table public.occurrence_documents add constraint occurrence_documents_tenant_id_id_key unique (tenant_id,id);
alter table public.occurrence_items add constraint occurrence_items_tenant_occurrence_fkey foreign key(tenant_id,occurrence_id) references public.occurrences(tenant_id,id) on delete cascade;
alter table public.occurrence_financial_entries add constraint occurrence_financial_tenant_occurrence_fkey foreign key(tenant_id,occurrence_id) references public.occurrences(tenant_id,id) on delete cascade;
alter table public.occurrence_documents add constraint occurrence_documents_tenant_occurrence_fkey foreign key(tenant_id,occurrence_id) references public.occurrences(tenant_id,id) on delete cascade;
alter table public.occurrence_attachments add constraint occurrence_attachments_tenant_occurrence_fkey foreign key(tenant_id,occurrence_id) references public.occurrences(tenant_id,id) on delete cascade;

do $$ declare t text; begin foreach t in array array['occurrence_items','occurrence_financial_entries','occurrence_documents','occurrence_attachments'] loop
 execute format('create index if not exists %I on public.%I(tenant_id)',t||'_tenant_idx',t);
 execute format('create index if not exists %I on public.%I(occurrence_id)',t||'_occurrence_idx',t);
 execute format('create index if not exists %I on public.%I(tenant_id,occurrence_id) where deleted_at is null',t||'_tenant_occurrence_idx',t);
 execute format('alter table public.%I enable row level security',t);
 end loop; end $$;

with p(key,name,resource,action) as (values
 ('occurrence_items.view','Visualizar itens','occurrence_items','view'),('occurrence_items.create','Criar itens','occurrence_items','create'),('occurrence_items.update','Atualizar itens','occurrence_items','update'),('occurrence_items.delete','Remover itens','occurrence_items','delete'),
 ('occurrence_financial_entries.view','Visualizar valores e despesas','occurrence_financial_entries','view'),('occurrence_financial_entries.create','Criar valores e despesas','occurrence_financial_entries','create'),('occurrence_financial_entries.update','Atualizar valores e despesas','occurrence_financial_entries','update'),('occurrence_financial_entries.delete','Remover valores e despesas','occurrence_financial_entries','delete'),
 ('occurrence_documents.view','Visualizar documentos','occurrence_documents','view'),('occurrence_documents.create','Criar documentos','occurrence_documents','create'),('occurrence_documents.update','Atualizar documentos','occurrence_documents','update'),('occurrence_documents.delete','Remover documentos','occurrence_documents','delete'),
 ('occurrence_attachments.view','Visualizar evidências','occurrence_attachments','view'),('occurrence_attachments.create','Criar evidências','occurrence_attachments','create'),('occurrence_attachments.delete','Remover evidências','occurrence_attachments','delete'))
insert into public.permissions(key,name,module_key,resource,action,description) select key,name,'atendimento',resource,action,name||' da ocorrência.' from p on conflict(key) do nothing;
insert into public.role_permissions(tenant_id,role_id,permission_id) select r.tenant_id,r.id,p.id from public.roles r cross join public.permissions p where r.key='owner' and p.key like 'occurrence_%' on conflict do nothing;

create policy "occurrence items view" on public.occurrence_items for select to authenticated using(public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_items.view'));
create policy "occurrence items create" on public.occurrence_items for insert to authenticated with check(public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_items.create'));
create policy "occurrence items update" on public.occurrence_items for update to authenticated using(public.is_member_of_tenant(tenant_id) and (public.user_has_permission(tenant_id,'occurrence_items.update') or public.user_has_permission(tenant_id,'occurrence_items.delete'))) with check(public.is_member_of_tenant(tenant_id));
create policy "occurrence financial view" on public.occurrence_financial_entries for select to authenticated using(public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_financial_entries.view'));
create policy "occurrence financial create" on public.occurrence_financial_entries for insert to authenticated with check(public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_financial_entries.create'));
create policy "occurrence financial update" on public.occurrence_financial_entries for update to authenticated using(public.is_member_of_tenant(tenant_id) and (public.user_has_permission(tenant_id,'occurrence_financial_entries.update') or public.user_has_permission(tenant_id,'occurrence_financial_entries.delete'))) with check(public.is_member_of_tenant(tenant_id));
create policy "occurrence documents view" on public.occurrence_documents for select to authenticated using(public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_documents.view'));
create policy "occurrence documents create" on public.occurrence_documents for insert to authenticated with check(public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_documents.create'));
create policy "occurrence documents update" on public.occurrence_documents for update to authenticated using(public.is_member_of_tenant(tenant_id) and (public.user_has_permission(tenant_id,'occurrence_documents.update') or public.user_has_permission(tenant_id,'occurrence_documents.delete'))) with check(public.is_member_of_tenant(tenant_id));
create policy "occurrence attachments view" on public.occurrence_attachments for select to authenticated using(public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_attachments.view'));
create policy "occurrence attachments create" on public.occurrence_attachments for insert to authenticated with check(public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_attachments.create'));
create policy "occurrence attachments delete" on public.occurrence_attachments for update to authenticated using(public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_attachments.delete')) with check(public.is_member_of_tenant(tenant_id));
