import React from 'react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Callout from '../ui/Callout';
import { HealthResponse } from '../../types';

interface HealthStatusPanelProps {
  loading: boolean;
  error: string | null;
  health: HealthResponse | null;
}

const HealthStatusPanel: React.FC<HealthStatusPanelProps> = ({ loading, error, health }) => {
  return (
    <Card title="Backend status" description="Live service health and environment.">
      <div className="flex flex-col gap-3 text-sm text-slate-600">
        {loading && <p>Checking connection...</p>}
        {error && (
          <Callout variant="error" title="Disconnected">
            {error}
          </Callout>
        )}
        {health && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="success">Connected</Badge>
              <span className="text-xs text-slate-400">Environment: {health.environment}</span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              <pre className="whitespace-pre-wrap">{JSON.stringify(health, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default HealthStatusPanel;
