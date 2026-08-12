-- Catalog-only hotfix: no dashboards, widgets, reports, agents, or reprocessing.
update public.native_indicator_definitions
set available_for_dashboard=true, available_for_reports=true, status='active', updated_at=now()
where indicator_key in (
  'occurrences_open_count','occurrences_overdue_count','occurrences_by_status',
  'occurrences_by_sla_status','occurrences_by_priority','occurrences_by_reason_category',
  'occurrences_by_reason','occurrence_avg_resolution_time','occurrences_with_pending_actions',
  'occurrence_pending_actions_overdue_count','occurrences_without_operation_link',
  'occurrences_by_source_channel'
);

update public.native_indicator_definitions
set status='inactive', updated_at=now()
where indicator_key='occurrence_financial_entries_total';
