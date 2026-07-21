-- Sprint 17E: controlled semantic-read capabilities for the existing General Chat.
insert into public.ai_tools(tool_key,name,description,module_key) values
('treated_data.list_records','Listar registros tratados','Lista registros canônicos com filtros permitidos e limite seguro.','core'),
('treated_data.get_entity_performance','Consultar desempenho de entidade','Resume motorista, veículo, cliente, rota ou status com dados canônicos.','core'),
('treated_data.get_operational_overview','Consultar visão operacional','Retorna visão operacional agregada e sanitizada.','core'),
('indicators.search','Buscar indicador','Localiza indicador nativo ou personalizado homologado.','core'),
('dashboards.search_context','Consultar contexto de dashboard','Consulta dashboards publicados e seus insights já gerados.','core'),
('reports.search_context','Consultar contexto de relatório','Consulta relatórios gerados e seus snapshots resumidos.','core')
on conflict(tool_key) do update set name=excluded.name,description=excluded.description,module_key=excluded.module_key,updated_at=now();
