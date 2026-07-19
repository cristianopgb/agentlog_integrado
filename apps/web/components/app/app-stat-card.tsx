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
    <AppCard className={cn('relative overflow-hidden p-4 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-blue-500', className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
        </div>
        {icon && (
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
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
