update public.data_source_field_parse_rules
set date_format = case date_format
  when 'YYYY-MM-DD' then 'yyyy_mm_dd'
  when 'YYYY-MM-DD HH:mm:ss' then 'yyyy_mm_dd_hh_mm_ss'
  when 'YYYY-MM-DDTHH:mm:ss' then 'yyyy_mm_dd_t_hh_mm_ss'
  when 'DD/MM/YYYY' then 'dd_mm_yyyy'
  when 'DD/MM/YYYY HH:mm:ss' then 'dd_mm_yyyy_hh_mm_ss'
  else date_format
end
where date_format in (
  'YYYY-MM-DD',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DDTHH:mm:ss',
  'DD/MM/YYYY',
  'DD/MM/YYYY HH:mm:ss'
);

alter table public.data_source_field_parse_rules
  drop constraint if exists data_source_field_parse_rules_date_format_check;

alter table public.data_source_field_parse_rules
  add constraint data_source_field_parse_rules_date_format_check
  check (
    date_format is null
    or date_format in (
      'iso_auto',
      'yyyy_mm_dd',
      'yyyy_mm_dd_hh_mm_ss',
      'yyyy_mm_dd_t_hh_mm_ss',
      'dd_mm_yyyy',
      'dd_mm_yyyy_hh_mm_ss',
      'YYYY-MM-DD HH:mm',
      'YYYY-MM-DD HH:mm:ss.SSS',
      'YYYY-MM-DDTHH:mm:ss.SSSZ',
      'DD/MM/YYYY HH:mm',
      'MM/DD/YYYY',
      'MM/DD/YYYY HH:mm',
      'MM/DD/YYYY HH:mm:ss'
    )
  );
