import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppCard } from './app-card';

interface AppStatCardProps {
  label: string;
  value: ReactNode;
  description?: string;
  trend?: { value: string; direction?: 'up' | 'down' };
  icon?: ReactNode;
  className?: string;
}

function AppStatCard({
  label,
  value,
  description,
  trend,
  icon,
  className,
}: AppStatCardProps) {
  const up = trend?.direction !== 'down';
  return (
    <AppCard className={cn('relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-100/50', className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-[-0.03em]">{value}</p>
        </div>
        {icon && (
          <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 p-2.5 text-primary shadow-sm">
            {icon}
          </div>
        )}
      </div>
      {(description || trend) && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          {trend && (
            <span
              className={cn(
                'inline-flex items-center gap-1 font-semibold',
                up ? 'text-emerald-600' : 'text-rose-600',
              )}
            >
              {up ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {trend.value}
            </span>
          )}
          {description && <span>{description}</span>}
        </div>
      )}
    </AppCard>
  );
}
export { AppStatCard };
