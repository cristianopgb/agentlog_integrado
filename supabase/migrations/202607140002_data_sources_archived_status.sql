alter table public.data_sources drop constraint if exists data_sources_status_check;
alter table public.data_sources add constraint data_sources_status_check check (status in ('draft','active','inactive','archived','deprecated'));
