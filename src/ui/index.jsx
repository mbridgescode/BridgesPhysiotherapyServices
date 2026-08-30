import React from 'react';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';
import { Dialog as RadixDialog } from 'radix-ui';
import { X } from 'lucide-react';

export const cn = (...inputs) => clsx(inputs);

export const buttonVariants = cva('ui-button', {
  variants: {
    variant: {
      primary: 'ui-button-primary',
      secondary: 'ui-button-secondary',
      ghost: 'ui-button-ghost',
    },
    size: {
      sm: 'ui-button-sm',
      md: '',
      lg: 'ui-button-lg',
    },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

export function Button({ className, variant, size, ...props }) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function TextInput({ label, id, error, helperText, trailing, className, ...props }) {
  return (
    <div className={cn('ui-field', className)}>
      {label && <label className="ui-label" htmlFor={id}>{label}</label>}
      <span className={trailing ? 'ui-input-wrap' : undefined}>
        <input id={id} className="ui-input" aria-invalid={Boolean(error)} {...props} />
        {trailing}
      </span>
      {(error || helperText) && <span className={error ? 'ui-help text-rose-300' : 'ui-help'}>{error || helperText}</span>}
    </div>
  );
}

export function StatusMessage({ type = 'error', children }) {
  if (!children) return null;
  return <div className={cn('ui-status', type === 'success' ? 'ui-status-success' : 'ui-status-error')} role="alert">{children}</div>;
}

export function Dialog({ open, onOpenChange, title, description, children, actions }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="ui-dialog-overlay" />
        <RadixDialog.Content className="ui-dialog-content">
          <div className="ui-dialog-heading">
            <div>
              <RadixDialog.Title className="ui-dialog-title">{title}</RadixDialog.Title>
              {description && <RadixDialog.Description className="ui-dialog-description">{description}</RadixDialog.Description>}
            </div>
            <RadixDialog.Close className="app-icon-button" aria-label="Close dialog">
              <X size={17} />
            </RadixDialog.Close>
          </div>
          <div className="ui-dialog-body">{children}</div>
          {actions && <div className="ui-dialog-actions">{actions}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function LoadingState({ label = 'Loading' }) {
  return <div className="ui-loading-state" role="status" aria-live="polite"><span className="app-spinner" aria-hidden="true" />{label}</div>;
}

export function EmptyState({ title = 'Nothing here yet', description, action }) {
  return <div className="ui-empty-state"><strong>{title}</strong>{description && <p>{description}</p>}{action}</div>;
}
