import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
const AppButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => <Button ref={ref} className={`rounded-xl font-bold shadow-sm ${className ?? ''}`} {...props} />,
);
AppButton.displayName = 'AppButton';
export { AppButton };
