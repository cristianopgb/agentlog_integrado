import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
const Sheet = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const SheetTrigger = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const SheetPortal = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const SheetClose = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const SheetOverlay = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('fixed inset-0 z-50 bg-slate-950/40', className)}
    {...props}
  />
);
const SheetContent = ({
  side = 'right',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
}) => (
  <div
    role="dialog"
    aria-modal="true"
    className={cn(
      'fixed z-50 bg-background p-6 shadow-lg',
      side === 'right' && 'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
      side === 'left' && 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
      side === 'top' && 'inset-x-0 top-0 border-b',
      side === 'bottom' && 'inset-x-0 bottom-0 border-t',
      className,
    )}
    {...props}
  >
    {children}
    <button
      type="button"
      aria-label="Fechar"
      className="absolute right-4 top-4"
    >
      <X className="h-4 w-4" />
    </button>
  </div>
);
const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-2 text-center sm:text-left',
      className,
    )}
    {...props}
  />
);
const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className,
    )}
    {...props}
  />
);
const SheetTitle = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={className} {...props} />
);
const SheetDescription = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={className} {...props} />
);
export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
