-- Sprint 12-A hardening: replying to a message must not grant direct updates
-- to the parent conversation.
drop policy if exists "inbox conversations update" on public.inbox_conversations;

create policy "inbox conversations update"
  on public.inbox_conversations
  for update
  to authenticated
  using (
    public.is_member_of_tenant(tenant_id)
    and (
      public.user_has_permission(tenant_id, 'occurrences.inbox.assign')
      or public.user_has_permission(tenant_id, 'occurrences.inbox.close')
    )
  )
  with check (
    public.is_member_of_tenant(tenant_id)
    and (
      public.user_has_permission(tenant_id, 'occurrences.inbox.assign')
      or public.user_has_permission(tenant_id, 'occurrences.inbox.close')
    )
  );
