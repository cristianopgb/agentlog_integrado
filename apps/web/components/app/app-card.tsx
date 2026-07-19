import * as React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
type AppCardProps = React.ComponentPropsWithoutRef<typeof Card>;
const AppCard = React.forwardRef<HTMLDivElement, AppCardProps>(
  ({ className, ...props }, ref) => (
    <Card
      ref={ref}
      className={cn('rounded-2xl shadow-sm', className)}
      {...props}
    />
  ),
);
AppCard.displayName = 'AppCard';
export { AppCard };
