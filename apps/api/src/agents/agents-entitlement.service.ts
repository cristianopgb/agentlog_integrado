import { Injectable } from '@nestjs/common';

/** Central seam for future plan keys: agents.dashboard.realtime_voice and agents.realtime_monthly_minutes_limit. */
@Injectable()
export class AgentsEntitlementService {
  dashboardRealtimeVoice() {
    return { enabled: process.env.AI_REALTIME_ENABLED === 'true', reason: 'Voz ao vivo não está habilitada neste ambiente.' };
  }
}
