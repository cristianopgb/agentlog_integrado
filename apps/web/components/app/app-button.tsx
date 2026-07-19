import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
const AppButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => <Button ref={ref} {...props} />,
);
AppButton.displayName = 'AppButton';
export { AppButton };
