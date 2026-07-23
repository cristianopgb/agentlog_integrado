-- Allow controlled Realtime voice sessions while preserving every existing trigger type.
alter table public.ai_runs
  drop constraint if exists ai_runs_trigger_type_check;

alter table public.ai_runs
  add constraint ai_runs_trigger_type_check
  check (trigger_type in ('manual','dashboard_publish','dashboard_refresh','report_generate','chat_message','inbox_message','voice_realtime'));
