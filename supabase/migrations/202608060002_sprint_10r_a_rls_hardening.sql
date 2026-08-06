-- Sprint 10R-A homologation hardening: tenant isolation and permission-aware access.
drop index if exists public.occurrence_one_primary_operation;
create unique index occurrence_one_primary_operation
  on public.occurrence_operation_links (tenant_id, occurrence_id)
  where is_primary;

create policy "tenant members read occurrences"
  on public.occurrences for select to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrences.view'));
create policy "tenant members create occurrences"
  on public.occurrences for insert to authenticated
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrences.create'));
create policy "tenant members update occurrences"
  on public.occurrences for update to authenticated
  using (public.is_member_of_tenant(tenant_id) and (public.user_has_permission(tenant_id, 'occurrences.update') or public.user_has_permission(tenant_id, 'occurrences.assign') or public.user_has_permission(tenant_id, 'occurrences.kanban.move')))
  with check (public.is_member_of_tenant(tenant_id) and (public.user_has_permission(tenant_id, 'occurrences.update') or public.user_has_permission(tenant_id, 'occurrences.assign') or public.user_has_permission(tenant_id, 'occurrences.kanban.move')));

create policy "tenant members read occurrence operation links"
  on public.occurrence_operation_links for select to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrences.view'));
create policy "tenant members create occurrence operation links"
  on public.occurrence_operation_links for insert to authenticated
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_operation_links.create'));
create policy "tenant members update occurrence operation links"
  on public.occurrence_operation_links for update to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_operation_links.create'))
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_operation_links.create'));
create policy "tenant members delete occurrence operation links"
  on public.occurrence_operation_links for delete to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_operation_links.delete'));

create policy "tenant members read occurrence events"
  on public.occurrence_events for select to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrences.view'));
create policy "tenant members create occurrence events"
  on public.occurrence_events for insert to authenticated
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_events.create'));

create policy "tenant members read occurrence reason categories"
  on public.occurrence_reason_categories for select to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_reasons.view'));
create policy "tenant members create occurrence reason categories"
  on public.occurrence_reason_categories for insert to authenticated
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_reasons.create'));
create policy "tenant members update occurrence reason categories"
  on public.occurrence_reason_categories for update to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_reasons.update'))
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_reasons.update'));

create policy "tenant members read occurrence reason templates"
  on public.occurrence_reason_templates for select to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_reasons.view'));
create policy "tenant members create occurrence reason templates"
  on public.occurrence_reason_templates for insert to authenticated
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_reasons.create'));
create policy "tenant members update occurrence reason templates"
  on public.occurrence_reason_templates for update to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_reasons.update'))
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_reasons.update'));

create policy "tenant members read occurrence reasons"
  on public.occurrence_reasons for select to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_reasons.view'));
create policy "tenant members create occurrence reasons"
  on public.occurrence_reasons for insert to authenticated
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_reasons.create'));
create policy "tenant members update occurrence reasons"
  on public.occurrence_reasons for update to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_reasons.update'))
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'occurrence_reasons.update'));
