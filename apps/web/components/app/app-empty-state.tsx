import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
interface AppEmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}
function AppEmptyState({
  title,
  description,
  action,
  icon = <Inbox className="h-5 w-5" />,
  className,
}: AppEmptyStateProps) {
  return (
    <div
      className={cn(
        'app-empty rounded-2xl border border-dashed border-slate-200 bg-gradient-to-b from-slate-50 to-white px-6 py-9 text-center',
        className,
      )}
    >
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-sm">
        {icon}
      </div>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export { AppEmptyState };
