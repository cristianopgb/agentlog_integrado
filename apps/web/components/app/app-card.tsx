import * as React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
type AppCardProps = React.ComponentPropsWithoutRef<typeof Card>;
const AppCard = React.forwardRef<HTMLDivElement, AppCardProps>(
  ({ className, ...props }, ref) => (
    <Card
      ref={ref}
      className={cn('app-surface rounded-2xl border-slate-200/80 shadow-[0_8px_24px_rgba(15,23,42,0.045)]', className)}
      {...props}
    />
  ),
);
AppCard.displayName = 'AppCard';
export { AppCard };
