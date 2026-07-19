import * as React from 'react';
import { LoaderCircle } from 'lucide-react';
import { AppButton } from './app-button';
import type { ButtonProps } from '@/components/ui/button';
interface AppLoadingButtonProps extends ButtonProps {
  loading?: boolean;
  loadingLabel?: string;
}
const AppLoadingButton = React.forwardRef<
  HTMLButtonElement,
  AppLoadingButtonProps
>(({ loading = false, loadingLabel, children, disabled, ...props }, ref) => (
  <AppButton ref={ref} disabled={disabled || loading} {...props}>
    {loading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
    {loading ? (loadingLabel ?? children) : children}
  </AppButton>
));
AppLoadingButton.displayName = 'AppLoadingButton';
export { AppLoadingButton };
