import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
const DropdownMenu = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const DropdownMenuTrigger = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const DropdownMenuGroup = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const DropdownMenuPortal = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const DropdownMenuSub = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const DropdownMenuRadioGroup = ({
  children,
}: {
  children: React.ReactNode;
}) => <>{children}</>;
const DropdownMenuContent = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'z-50 min-w-[8rem] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md',
      className,
    )}
    {...props}
  />
);
const DropdownMenuItem = ({
  className,
  inset,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { inset?: boolean }) => (
  <button
    type="button"
    className={cn(
      'relative flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50',
      inset && 'pl-8',
      className,
    )}
    {...props}
  />
);
const DropdownMenuLabel = ({
  className,
  inset,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }) => (
  <div
    className={cn(
      'px-2 py-1.5 text-sm font-semibold',
      inset && 'pl-8',
      className,
    )}
    {...props}
  />
);
const DropdownMenuSeparator = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
);
const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn('ml-auto text-xs tracking-widest opacity-60', className)}
    {...props}
  />
);
const DropdownMenuSubTrigger = ({
  className,
  inset,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { inset?: boolean }) => (
  <button
    type="button"
    className={cn(
      'flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
      inset && 'pl-8',
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4" />
  </button>
);
const DropdownMenuSubContent = DropdownMenuContent;
const DropdownMenuCheckboxItem = DropdownMenuItem;
const DropdownMenuRadioItem = DropdownMenuItem;
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
};
