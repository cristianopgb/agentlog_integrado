-- Sprint 10R-G hardening: mapping visibility and established module alignment.
alter table public.canonical_fields
  add column if not exists is_importable boolean not null default true,
  add column if not exists is_analytics_only boolean not null default false;

update public.canonical_entities
set module_key='atendimento', updated_at=now()
where entity_key='occurrences' and module_key is distinct from 'atendimento';

update public.indicator_field_catalog
set module_key='atendimento'
where base_table='occurrence_analytics_view' and module_key is distinct from 'atendimento';

update public.native_indicator_definitions
set module_key='atendimento', family_key='occurrences', updated_at=now()
where family_key='occurrences' or indicator_key in (
 'occurrences_open_count','occurrences_overdue_count','occurrences_by_sla_status',
 'occurrences_by_status','occurrences_by_reason_category','occurrences_by_priority',
 'occurrences_without_operation_link','occurrence_avg_resolution_time',
 'occurrence_pending_actions_overdue_count','occurrence_financial_entries_total'
);

-- Only fields accepted by controlled occurrence normalization are mapping targets.
update public.canonical_fields f
set is_importable = f.field_key in (
 'occurrence_number','title','description','current_priority','source_channel',
 'opened_at','due_at','linked_document_number','linked_invoice_number',
 'linked_cte_number','linked_delivery_number'
),
is_analytics_only = f.field_key not in (
 'occurrence_number','title','description','current_priority','source_channel',
 'opened_at','due_at','linked_document_number','linked_invoice_number',
 'linked_cte_number','linked_delivery_number'
), updated_at=now()
from public.canonical_entities e
where e.id=f.canonical_entity_id and e.tenant_id=f.tenant_id and e.entity_key='occurrences';

-- Explicit analytics-only allowlist; these values are calculated from the
-- transactional aggregate and must never be offered as ingestion targets.
update public.canonical_fields f
set is_importable=false, is_analytics_only=true, updated_at=now()
from public.canonical_entities e
where e.id=f.canonical_entity_id and e.tenant_id=f.tenant_id
  and e.entity_key='occurrences' and f.field_key in (
   'current_status','resolved_at','closed_at','sla_status','resolution_summary',
   'closed_reason','closed_notes','reason_code','reason_name','reason_category',
   'responsible_team','has_operation_link','has_pending_actions',
   'pending_actions_count','treatments_count','financial_entries_total',
   'documents_count','attachments_count'
  );

create index if not exists canonical_fields_importable_idx
on public.canonical_fields(tenant_id,canonical_entity_id,sort_order)
where is_importable and not is_analytics_only;
