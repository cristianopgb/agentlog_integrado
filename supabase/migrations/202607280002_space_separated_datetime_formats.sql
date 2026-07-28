alter table public.data_source_field_parse_rules
  drop constraint data_source_field_parse_rules_date_format_check;

alter table public.data_source_field_parse_rules
  add constraint data_source_field_parse_rules_date_format_check
  check (
    date_format is null
    or date_format in (
      'YYYY-MM-DD',
      'YYYY-MM-DD HH:mm',
      'YYYY-MM-DD HH:mm:ss',
      'YYYY-MM-DD HH:mm:ss.SSS',
      'YYYY-MM-DDTHH:mm:ss',
      'YYYY-MM-DDTHH:mm:ss.SSSZ',
      'DD/MM/YYYY',
      'DD/MM/YYYY HH:mm',
      'DD/MM/YYYY HH:mm:ss',
      'MM/DD/YYYY',
      'MM/DD/YYYY HH:mm',
      'MM/DD/YYYY HH:mm:ss'
    )
  );
