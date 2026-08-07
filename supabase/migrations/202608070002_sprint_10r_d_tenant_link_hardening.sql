-- Sprint 10R-D hardening: optional structured links must remain inside the
-- record's tenant and, for occurrence-owned records, inside its occurrence.
alter table public.occurrence_events
  add constraint occurrence_events_tenant_occurrence_id_key
  unique (tenant_id, occurrence_id, id);

alter table public.occurrence_documents
  add constraint occurrence_documents_tenant_occurrence_id_key
  unique (tenant_id, occurrence_id, id);

alter table public.occurrence_items
  drop constraint occurrence_items_event_id_fkey,
  drop constraint occurrence_items_operation_record_id_fkey,
  add constraint occurrence_items_tenant_occurrence_event_fkey
    foreign key (tenant_id, occurrence_id, event_id)
    references public.occurrence_events (tenant_id, occurrence_id, id),
  add constraint occurrence_items_tenant_operation_fkey
    foreign key (tenant_id, operation_record_id)
    references public.operation_records (tenant_id, id);

alter table public.occurrence_financial_entries
  drop constraint occurrence_financial_entries_event_id_fkey,
  drop constraint occurrence_financial_receipt_fkey,
  add constraint occurrence_financial_tenant_occurrence_event_fkey
    foreign key (tenant_id, occurrence_id, event_id)
    references public.occurrence_events (tenant_id, occurrence_id, id),
  add constraint occurrence_financial_tenant_occurrence_receipt_fkey
    foreign key (tenant_id, occurrence_id, receipt_document_id)
    references public.occurrence_documents (tenant_id, occurrence_id, id);

alter table public.occurrence_documents
  drop constraint occurrence_documents_event_id_fkey,
  add constraint occurrence_documents_tenant_occurrence_event_fkey
    foreign key (tenant_id, occurrence_id, event_id)
    references public.occurrence_events (tenant_id, occurrence_id, id);

alter table public.occurrence_attachments
  drop constraint occurrence_attachments_event_id_fkey,
  drop constraint occurrence_attachments_document_id_fkey,
  add constraint occurrence_attachments_tenant_occurrence_event_fkey
    foreign key (tenant_id, occurrence_id, event_id)
    references public.occurrence_events (tenant_id, occurrence_id, id),
  add constraint occurrence_attachments_tenant_occurrence_document_fkey
    foreign key (tenant_id, occurrence_id, document_id)
    references public.occurrence_documents (tenant_id, occurrence_id, id);

-- Generic updates require the update permission on both USING and WITH CHECK.
-- Soft deletes remain available only through the permission-guarded backend,
-- which uses the service role and restricts the update to deleted_at.
drop policy "occurrence items update" on public.occurrence_items;
create policy "occurrence items update" on public.occurrence_items
  for update to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_items.update'))
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_items.update'));

drop policy "occurrence financial update" on public.occurrence_financial_entries;
create policy "occurrence financial update" on public.occurrence_financial_entries
  for update to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_financial_entries.update'))
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_financial_entries.update'));

drop policy "occurrence documents update" on public.occurrence_documents;
create policy "occurrence documents update" on public.occurrence_documents
  for update to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_documents.update'))
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_documents.update'));

drop policy "occurrence attachments delete" on public.occurrence_attachments;
