import React from 'react';

interface CardProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  compact?: boolean;
  children: React.ReactNode;
}

const Card: React.FC<CardProps> = ({
  title,
  description,
  actions,
  className = '',
  compact,
  children,
}) => (
  <section
    className={`rounded-xl border border-slate-200/80 bg-white ${compact ? 'p-4' : 'p-5'} ${className}`}
  >
    {(title || description || actions) && (
      <div className={`flex flex-wrap items-start justify-between gap-2 ${compact ? 'mb-3' : 'mb-4'}`}>
        <div className="min-w-0">
          {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);

export default Card;
