const labels: Record<string, string> = {
  transport:'Transporte', transporte:'Transporte', finance:'Financeiro', financeiro:'Financeiro', attendance:'Atendimento', atendimento:'Atendimento', warehouse:'Armazém', armazem:'Armazém', team:'Equipes', equipes:'Equipes', core:'Core',
  draft:'Rascunho', active:'Ativo', archived:'Arquivado', published:'Publicado', completed:'Concluído', failed:'Falhou', pending:'Pendente', processing:'Processando', manual:'Manual', scheduled:'Agendado', daily:'Diária', weekly:'Semanal', monthly:'Mensal',
  kpi:'KPI', table:'Tabela', matrix:'Matriz', bar:'Barra', pie:'Pizza', line:'Linha', native_indicator:'Indicador nativo', custom_indicator:'Indicador personalizado', native:'Nativo', custom:'Personalizado', date_range:'Período', multi_select:'Seleção múltipla',
  issued_at:'Data de emissão', expected_date:'Data prevista', completed_at:'Data de entrega', updated_at:'Data de atualização', customer_name:'Cliente', shipper_name:'Embarcador', recipient_name:'Destinatário', origin_city:'Cidade origem', origin_state:'UF origem', destination_city:'Cidade destino', destination_state:'UF destino', status:'Status', document_type:'Tipo de documento', driver_name:'Motorista', vehicle_plate:'Veículo',
};
export const displayLabel = (key: string) => labels[key] ?? key.replace(/_/g, ' ');
export const reportFilterLabel = (key: string) => labels[key] ?? 'Filtro do relatório';
export const reportFrequencyLabel = (frequency: string) => displayLabel(frequency);
