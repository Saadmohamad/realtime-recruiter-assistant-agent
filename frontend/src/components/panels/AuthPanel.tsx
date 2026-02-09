import React from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Callout from '../ui/Callout';
import { User } from '../../types';

interface AuthPanelProps {
  currentUser: User | null;
  authMode: 'login' | 'register';
  email: string;
  password: string;
  organizationName: string;
  authLoading: boolean;
  authError: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onOrganizationChange: (value: string) => void;
  onAuthModeChange: (mode: 'login' | 'register') => void;
  onLogin: (event: React.FormEvent) => void;
  onRegister: (event: React.FormEvent) => void;
}

const AuthPanel: React.FC<AuthPanelProps> = ({
  currentUser,
  authMode,
  email,
  password,
  organizationName,
  authLoading,
  authError,
  onEmailChange,
  onPasswordChange,
  onOrganizationChange,
  onAuthModeChange,
  onLogin,
  onRegister,
}) => {
  if (currentUser) return null;

  return (
    <div className="space-y-5">
      {/* Tab toggle */}
      <div className="flex rounded-lg bg-slate-100 p-0.5">
        {(['login', 'register'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onAuthModeChange(mode)}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold capitalize transition ${
              authMode === mode
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      <form
        className="space-y-3"
        onSubmit={authMode === 'login' ? onLogin : onRegister}
      >
        <Input
          type="email"
          label="Email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          required
        />
        <Input
          type="password"
          label="Password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
        />
        {authMode === 'register' && (
          <Input
            type="text"
            label="Organization"
            placeholder="Acme Recruiting"
            value={organizationName}
            onChange={(e) => onOrganizationChange(e.target.value)}
            required
          />
        )}
        {authError && <Callout variant="error">{authError}</Callout>}
        <Button type="submit" disabled={authLoading} className="w-full">
          {authLoading ? 'Please wait...' : authMode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
      </form>
    </div>
  );
};

export default AuthPanel;
