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
        'rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center',
        className,
      )}
    >
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-background text-muted-foreground shadow-sm">
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
