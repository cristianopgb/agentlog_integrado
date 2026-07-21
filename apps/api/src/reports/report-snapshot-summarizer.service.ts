import { Injectable } from '@nestjs/common';
import { summarizeWidgetResult } from '../shared/widget-result-snapshot';

/** Summarizes only already-rendered bloco results; it never queries data sources. */
@Injectable()
export class ReportSnapshotSummarizerService {
  snapshot(result: unknown, resultShape: string) { return summarizeWidgetResult(result, resultShape, 'Dados insuficientes no bloco para uma análise detalhada.'); }
  summarize(result: unknown, resultShape: string): Record<string, unknown> { return this.snapshot(result, resultShape).deterministicSummary; }
}
