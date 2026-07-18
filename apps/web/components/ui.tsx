import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

export function Card({ children, className = '', style, onClick }: { children: ReactNode; className?: string; style?: CSSProperties; onClick?: MouseEventHandler<HTMLDivElement> }) {
  return <div style={style} onClick={onClick} className={`rounded-2xl border border-border/80 bg-white/90 p-6 shadow-sm shadow-slate-200/70 ${className}`}>{children}</div>;
}

export function SectionHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div>
      {eyebrow ? <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{eyebrow}</p> : null}
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">{title}</h1>
      {description ? <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{description}</p> : null}
      </div>{actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl shadow-sm">⌁</div>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </div>
  );
}

export function StatusBadge({ children, tone = 'neutral', status }: { children?: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'info'; status?: string }) {
  const tones = {
    neutral: 'border-slate-200 bg-slate-100 text-slate-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    info: 'border-blue-200 bg-blue-50 text-blue-700',
  };

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children ?? status}</span>;
}
