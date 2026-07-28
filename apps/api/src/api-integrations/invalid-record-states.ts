import { SupabaseService } from '../supabase/supabase.service';

export async function clearInvalidRecordStates(
  db: SupabaseService,
  tenantId: string,
  sourceId: string,
) {
  const states = await db.select<Array<{ id: string }>>(
    'data_source_api_record_states',
    `select=id,staging_record:staging_records!inner(validation_status)&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&staging_record.validation_status=eq.invalid`,
  );
  if (states.length)
    await db.delete(
      'data_source_api_record_states',
      `tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&id=in.(${states.map(({ id }) => id).join(',')})`,
    );
}
