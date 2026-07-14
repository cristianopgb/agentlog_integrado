alter table public.operation_records
  drop constraint if exists operation_records_document_type_check;

update public.operation_records
set document_type = case document_type
  when 'manifesto' then 'manifest'
  when 'pedido' then 'order'
  when 'entrega' then 'delivery'
  when 'outro' then 'other'
  else document_type
end
where document_type in ('manifesto','pedido','entrega','outro');

alter table public.operation_records
  add constraint operation_records_document_type_check
  check (
    document_type is null
    or document_type in ('cte','nfe','nf','nfse','order','delivery','manifest','other')
  );
