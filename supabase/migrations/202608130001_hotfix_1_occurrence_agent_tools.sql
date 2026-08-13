-- Ferramentas somente leitura sobre a visão canônica de ocorrências.
insert into public.ai_tools (tool_key,name,description,module_key,is_active) values
 ('occurrences.analytics.list','Listar ocorrências tratadas','Lista limitada e sanitizada da visão analítica de ocorrências.','atendimento',true),
 ('occurrences.analytics.detail','Detalhar ocorrência tratada','Consulta uma ocorrência por número na visão analítica tratada.','atendimento',true)
on conflict(tool_key) do update set name=excluded.name,description=excluded.description,module_key=excluded.module_key,is_active=true,updated_at=now();
