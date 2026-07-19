import * as React from 'react';
import { cn } from '@/lib/utils';
const Select = ({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    className={cn(
      'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      props.className,
    )}
    {...props}
  >
    {children}
  </select>
);
const SelectGroup = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const SelectValue = () => null;
const SelectTrigger = Select;
const SelectContent = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const SelectLabel = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
const SelectItem = ({
  children,
  value,
  ...props
}: React.OptionHTMLAttributes<HTMLOptionElement>) => (
  <option value={value} {...props}>
    {children}
  </option>
);
const SelectSeparator = () => null;
const SelectScrollUpButton = () => null;
const SelectScrollDownButton = () => null;
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
