import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
const Dialog = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DialogTrigger = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const DialogPortal = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const DialogClose = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const DialogOverlay = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('fixed inset-0 z-50 bg-slate-950/40', className)}
    {...props}
  />
);
const DialogContent = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    role="dialog"
    aria-modal="true"
    className={cn(
      'fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-background p-6 shadow-lg',
      className,
    )}
    {...props}
  >
    {children}
    <button
      type="button"
      aria-label="Fechar"
      className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
    >
      <X className="h-4 w-4" />
    </button>
  </div>
);
const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left',
      className,
    )}
    {...props}
  />
);
const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
      className,
    )}
    {...props}
  />
);
const DialogTitle = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn('text-lg font-semibold', className)} {...props} />
);
const DialogDescription = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-sm text-muted-foreground', className)} {...props} />
);
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
