import * as React from 'react';
import { cn } from '@/lib/utils';
const TooltipProvider = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const Tooltip = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const TooltipTrigger = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const TooltipContent = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    role="tooltip"
    className={cn(
      'z-50 w-fit rounded-md bg-foreground px-3 py-1.5 text-xs text-background',
      className,
    )}
    {...props}
  />
);
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
