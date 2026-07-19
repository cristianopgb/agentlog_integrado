import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function Card({ children, className = '', style, onClick }: { children: ReactNode; className?: string; style?: CSSProperties; onClick?: MouseEventHandler<HTMLDivElement> }) {
  return <div style={style} onClick={onClick} className={`app-surface rounded-2xl border border-slate-200/80 bg-white p-5 ${className}`}>{children}</div>;
}

export function SectionHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-heading flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div>
      {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</p> : null}
      <h1 className="mt-1.5 text-2xl font-bold tracking-[-0.035em] text-slate-950 md:text-[1.8rem]">{title}</h1>
      {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>{actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="app-empty rounded-2xl border border-dashed border-slate-200 bg-gradient-to-b from-slate-50 to-white p-8 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700 shadow-sm"><Inbox className="h-5 w-5" /></div>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </div>
  );
}

export function StatusBadge({ children, tone = 'neutral', status }: { children?: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'info'; status?: string }) {
  const tones = {
    neutral: 'border-slate-200 bg-slate-100/80 text-slate-600',
    success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-100 bg-amber-50 text-amber-700',
    info: 'border-blue-100 bg-blue-50 text-blue-700',
  };

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-4 ${tones[tone]}`}>{children ?? status}</span>;
}
