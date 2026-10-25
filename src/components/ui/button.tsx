import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
const variants = cva('ca-button', { variants: { variant: { default: 'ca-button-primary', outline: 'ca-button-outline', ghost: 'ca-button-ghost', danger: 'ca-button-danger' }, size: { sm: 'ca-button-sm', default: '', icon: 'ca-button-icon' } }, defaultVariants: { variant: 'default', size: 'default' } });
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>;
export const Button = React.forwardRef<HTMLButtonElement, Props>(function Button({ className, variant, size, ...props }, ref) { return <button ref={ref} className={cn(variants({ variant, size }), className)} {...props}/>; });
