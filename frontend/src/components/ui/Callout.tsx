import React from 'react';

type CalloutVariant = 'info' | 'success' | 'warning' | 'error';

interface CalloutProps {
  variant?: CalloutVariant;
  title?: string;
  children: React.ReactNode;
}

const variantStyles: Record<CalloutVariant, string> = {
  info: 'bg-blue-50/80 border-blue-200/60 text-blue-800',
  success: 'bg-emerald-50/80 border-emerald-200/60 text-emerald-800',
  warning: 'bg-amber-50/80 border-amber-200/60 text-amber-800',
  error: 'bg-rose-50/80 border-rose-200/60 text-rose-800',
};

const Callout: React.FC<CalloutProps> = ({ variant = 'info', title, children }) => (
  <div className={`rounded-lg border px-3 py-2 text-xs ${variantStyles[variant]}`}>
    {title && <p className="mb-0.5 font-semibold">{title}</p>}
    <div>{children}</div>
  </div>
);

export default Callout;
