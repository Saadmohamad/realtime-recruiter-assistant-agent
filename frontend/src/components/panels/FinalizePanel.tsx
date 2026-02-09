import React from 'react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Callout from '../ui/Callout';

interface FinalizePanelProps {
  recording: boolean;
  audioBlob: Blob | null;
  audioUploaded: boolean;
  uploading: boolean;
  finalizing: boolean;
  diarizedTranscript: string;
  onUploadAudio: () => void;
  onFinalize: () => void;
  onSave?: () => void;
}

const FinalizePanel: React.FC<FinalizePanelProps> = ({
  recording,
  audioBlob,
  audioUploaded,
  uploading,
  finalizing,
  diarizedTranscript,
  onUploadAudio,
  onFinalize,
  onSave,
}) => {
  const steps = [
    {
      label: 'Audio captured',
      done: Boolean(audioBlob),
      detail: audioBlob ? `${Math.round(audioBlob.size / 1024)} KB` : null,
    },
    {
      label: 'Transcript generated',
      done: Boolean(diarizedTranscript),
    },
  ];

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-900">Diarized transcript</h3>
        <p className="text-xs text-slate-500">Generate a high-quality diarized transcript that separates interviewer and candidate.</p>
      </div>

      {/* Progress steps */}
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-4">
          {steps.map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && (
                <div className={`h-px flex-1 ${s.done ? 'bg-emerald-400' : 'bg-slate-200'}`} />
              )}
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                    s.done
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {s.done ? '\u2713' : i + 1}
                </span>
                <div>
                  <p className={`text-xs font-medium ${s.done ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {s.label}
                  </p>
                  {s.detail && <p className="text-[10px] text-slate-400">{s.detail}</p>}
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-4 space-y-4">
        {recording && <Callout variant="warning">Recording in progress. Stop recording before generating.</Callout>}

        <Button
          onClick={onFinalize}
          disabled={finalizing || !audioBlob}
        >
          {finalizing ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Generating diarized transcript…
            </span>
          ) : (
            'Generate high-quality diarized transcript'
          )}
        </Button>

        {/* Diarized transcript */}
        {diarizedTranscript && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Diarized Transcript
              </p>
              <Badge variant="success">Ready</Badge>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-emerald-100 bg-emerald-50/30 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {diarizedTranscript}
              </p>
            </div>

            {/* Saved confirmation */}
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white font-bold">{'\u2713'}</span>
              <p className="text-xs font-medium text-emerald-800">
                Session saved. Available under <span className="font-semibold">Saved Sessions</span> in the sidebar.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinalizePanel;
