-- Sprint 17E sanitation. Keep tool and historical ai_tool_calls records intact.
-- This remains safe for installations whose ai_tools schema predates is_active.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_tools' and column_name='is_active') and exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_tools' and column_name='updated_at') then
    update public.ai_tools set is_active=false, updated_at=now() where tool_key in ('treated_data.list_records','treated_data.get_entity_performance','treated_data.get_operational_overview','indicators.search','dashboards.search_context','reports.search_context');
  elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_tools' and column_name='is_active') then
    update public.ai_tools set is_active=false where tool_key in ('treated_data.list_records','treated_data.get_entity_performance','treated_data.get_operational_overview','indicators.search','dashboards.search_context','reports.search_context');
  elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_tools' and column_name='status') and exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_tools' and column_name='updated_at') then
    update public.ai_tools set status='inactive', updated_at=now() where tool_key in ('treated_data.list_records','treated_data.get_entity_performance','treated_data.get_operational_overview','indicators.search','dashboards.search_context','reports.search_context');
  elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_tools' and column_name='status') then
    update public.ai_tools set status='inactive' where tool_key in ('treated_data.list_records','treated_data.get_entity_performance','treated_data.get_operational_overview','indicators.search','dashboards.search_context','reports.search_context');
  end if;
end $$;
