import * as React from 'react';
import { Badge, badgeVariants } from '@/components/ui/badge';
import type { VariantProps } from 'class-variance-authority';
type AppBadgeProps = React.ComponentPropsWithoutRef<typeof Badge> &
  VariantProps<typeof badgeVariants>;
function AppBadge(props: AppBadgeProps) {
  return <Badge {...props} />;
}
export { AppBadge };
