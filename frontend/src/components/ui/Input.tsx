import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
}

const Input: React.FC<InputProps> = ({ label, helperText, className = '', ...props }) => (
  <label className="block text-xs text-slate-700">
    {label && (
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
    )}
    <input
      className={`h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 ${className}`}
      {...props}
    />
    {helperText && (
      <span className="mt-1 block text-xs text-slate-400">{helperText}</span>
    )}
  </label>
);

export default Input;
