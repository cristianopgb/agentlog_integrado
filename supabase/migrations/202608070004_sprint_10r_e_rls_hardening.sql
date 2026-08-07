-- Sprint 10R-E hardening: delete permission must not grant generic updates.
drop policy if exists "occurrence treatments update" on public.occurrence_treatments;
create policy "occurrence treatments update"
on public.occurrence_treatments
for update
to authenticated
using (
  public.is_member_of_tenant(tenant_id)
  and public.user_has_permission(tenant_id, 'occurrence_treatments.update')
)
with check (
  public.is_member_of_tenant(tenant_id)
  and public.user_has_permission(tenant_id, 'occurrence_treatments.update')
);

drop policy if exists "occurrence pending actions update" on public.occurrence_pending_actions;
create policy "occurrence pending actions update"
on public.occurrence_pending_actions
for update
to authenticated
using (
  public.is_member_of_tenant(tenant_id)
  and public.user_has_permission(tenant_id, 'occurrence_pending_actions.update')
)
with check (
  public.is_member_of_tenant(tenant_id)
  and public.user_has_permission(tenant_id, 'occurrence_pending_actions.update')
);
