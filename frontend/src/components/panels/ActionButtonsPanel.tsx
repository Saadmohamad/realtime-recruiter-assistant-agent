import React from 'react';
import Callout from '../ui/Callout';
import { ActionButton } from '../../types';

interface ActionButtonsPanelProps {
  actionButtons: ActionButton[];
  actionLoading: boolean;
  actionCooldownUntil: number;
  actionOutput: string;
  actionError: string | null;
  onExecuteAction: (button: ActionButton) => void;
}

const ACTION_ICONS: Record<string, string> = {
  next_question: '\uD83C\uDFAF',
  probe_deeper: '\uD83D\uDD0D',
  red_flags: '\uD83D\uDEA9',
  coverage_check: '\uD83D\uDCCB',
  quick_assessment: '\uD83D\uDCCA',
};

const ActionButtonsPanel: React.FC<ActionButtonsPanelProps> = ({
  actionButtons,
  actionLoading,
  actionCooldownUntil,
  actionOutput,
  actionError,
  onExecuteAction,
}) => {
  const isCoolingDown = Date.now() < actionCooldownUntil;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-800">AI Actions</h3>
        <p className="text-[11px] text-slate-500">Run prompts mid-interview for instant insights.</p>
      </div>

      {/* Action buttons grid */}
      <div className="border-b border-slate-100 px-5 py-3">
        <div className="flex flex-wrap gap-2">
          {actionButtons.map((btn) => {
            const icon = ACTION_ICONS[btn.id] || '\u26A1';
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => onExecuteAction(btn)}
                disabled={actionLoading || isCoolingDown}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 active:bg-brand-100 disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-700"
              >
                <span>{icon}</span>
                {actionLoading ? 'Running\u2026' : btn.label}
              </button>
            );
          })}
        </div>
        {isCoolingDown && (
          <p className="mt-1.5 text-[11px] text-slate-400">Cooling down\u2026</p>
        )}
      </div>

      {/* Output area */}
      <div className="px-5 py-4">
        {actionError && (
          <Callout variant="error">{actionError}</Callout>
        )}

        {actionOutput ? (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              AI Output
            </p>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {actionOutput}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-center text-xs text-slate-400 py-2">
            Click an action above to get AI-powered insights from the live transcript.
          </p>
        )}
      </div>
    </div>
  );
};

export default ActionButtonsPanel;
