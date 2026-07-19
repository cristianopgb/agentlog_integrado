import * as React from 'react';
import { Badge, badgeVariants } from '@/components/ui/badge';
import type { VariantProps } from 'class-variance-authority';
type AppBadgeProps = React.ComponentPropsWithoutRef<typeof Badge> &
  VariantProps<typeof badgeVariants>;
function AppBadge({ className, ...props }: AppBadgeProps) {
  return <Badge className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide shadow-sm ${className ?? ''}`} {...props} />;
}
export { AppBadge };
