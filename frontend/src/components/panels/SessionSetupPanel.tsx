import React, { useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Callout from '../ui/Callout';
import Badge from '../ui/Badge';
import { ActionButton, InterviewSession, User } from '../../types';

interface SessionSetupPanelProps {
  currentUser: User | null;
  sessionTitle: string;
  sessionLoading: boolean;
  session: InterviewSession | null;
  actionButtons: ActionButton[];
  uploading: boolean;
  sessionError: string | null;
  jdFile: File | null;
  cvFile: File | null;
  onSessionTitleChange: (value: string) => void;
  onCreateSession: (event: React.FormEvent) => void;
  onUpdateActionButton: (index: number, field: 'label' | 'prompt', value: string) => void;
  onRemoveActionButton: (index: number) => void;
  onAddActionButton: () => void;
  onJdFileChange: (file: File | null) => void;
  onCvFileChange: (file: File | null) => void;
  onUploadBoth: () => void;
}

const SessionSetupPanel: React.FC<SessionSetupPanelProps> = ({
  currentUser,
  sessionTitle,
  sessionLoading,
  session,
  actionButtons,
  uploading,
  sessionError,
  jdFile,
  cvFile,
  onSessionTitleChange,
  onCreateSession,
  onUpdateActionButton,
  onRemoveActionButton,
  onAddActionButton,
  onJdFileChange,
  onCvFileChange,
  onUploadBoth,
}) => {
  const [showActions, setShowActions] = useState(false);

  if (!currentUser) {
    return (
      <Card title="Session setup" compact>
        <Callout variant="info">Sign in to create interview sessions.</Callout>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---- Step 1: Create session ---- */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              session ? 'bg-emerald-600 text-white' : 'bg-brand-600 text-white'
            }`}>
              {session ? '\u2713' : '1'}
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Name your session</h2>
              <p className="text-xs text-slate-500">Give this interview a recognizable title.</p>
            </div>
          </div>
        </div>
        <div className="px-5 py-4">
          {session ? (
            <div className="flex items-center gap-3">
              <Badge variant="success">Created</Badge>
              <span className="text-sm font-semibold text-slate-800">{session.title}</span>
              <span className="text-xs text-slate-400">#{session.id}</span>
            </div>
          ) : (
            <form className="flex items-end gap-3" onSubmit={onCreateSession}>
              <div className="flex-1">
                <Input
                  type="text"
                  label="Session title"
                  placeholder="Senior PM \u2014 Feb 2026"
                  value={sessionTitle}
                  onChange={(e) => onSessionTitleChange(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={sessionLoading} size="md">
                {sessionLoading ? 'Creating\u2026' : 'Create session'}
              </Button>
            </form>
          )}
        </div>
      </div>

      {/* ---- Step 2: Configure action buttons ---- */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowActions(!showActions)}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                2
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Configure action buttons</h2>
                <p className="text-xs text-slate-500">
                  {actionButtons.length} buttons configured \u00B7 Customize labels and prompts
                </p>
              </div>
            </div>
            <svg
              className={`h-4 w-4 text-slate-400 transition-transform ${showActions ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {showActions && (
          <div className="px-5 py-4 space-y-3">
            {actionButtons.map((btn, index) => (
              <div
                key={btn.id}
                className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 transition hover:border-slate-300"
              >
                <div className="grid gap-3 sm:grid-cols-[1fr,2fr]">
                  <Input
                    type="text"
                    label="Label"
                    value={btn.label}
                    onChange={(e) => onUpdateActionButton(index, 'label', e.target.value)}
                  />
                  <Textarea
                    label="Prompt"
                    rows={2}
                    value={btn.prompt}
                    onChange={(e) => onUpdateActionButton(index, 'prompt', e.target.value)}
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => onRemoveActionButton(index)}
                    disabled={actionButtons.length <= 1}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={onAddActionButton}>
              + Add action
            </Button>
          </div>
        )}
      </div>

      {/* ---- Step 3: Upload documents ---- */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              session && session.documents && session.documents.length >= 2
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {session && session.documents && session.documents.length >= 2 ? '\u2713' : '3'}
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Upload documents <span className="text-rose-500">*</span></h2>
              <p className="text-xs text-slate-500">Both a JD and CV are required before starting the interview.</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          {!session ? (
            <Callout variant="info">Create a session first to upload documents.</Callout>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* JD picker */}
                <div className={`rounded-lg border-2 border-dashed p-4 text-center transition ${
                  jdFile
                    ? 'border-emerald-300 bg-emerald-50/30'
                    : 'border-slate-200 bg-slate-50/30 hover:border-brand-300 hover:bg-brand-50/20'
                }`}>
                  <div className="mb-2 text-xl">📄</div>
                  <p className="mb-1 text-xs font-semibold text-slate-700">Job Description</p>
                  <p className="mb-3 text-[11px] text-slate-400">PDF, DOC, or TXT</p>
                  <Input
                    type="file"
                    onChange={(e) => onJdFileChange(e.target.files?.[0] || null)}
                    className="!h-auto !border-0 !bg-transparent !p-0 !text-xs"
                  />
                  {jdFile && (
                    <p className="mt-2 text-[11px] text-emerald-600 font-medium">{jdFile.name}</p>
                  )}
                </div>

                {/* CV picker */}
                <div className={`rounded-lg border-2 border-dashed p-4 text-center transition ${
                  cvFile
                    ? 'border-emerald-300 bg-emerald-50/30'
                    : 'border-slate-200 bg-slate-50/30 hover:border-brand-300 hover:bg-brand-50/20'
                }`}>
                  <div className="mb-2 text-xl">👤</div>
                  <p className="mb-1 text-xs font-semibold text-slate-700">Candidate CV</p>
                  <p className="mb-3 text-[11px] text-slate-400">PDF, DOC, or TXT</p>
                  <Input
                    type="file"
                    onChange={(e) => onCvFileChange(e.target.files?.[0] || null)}
                    className="!h-auto !border-0 !bg-transparent !p-0 !text-xs"
                  />
                  {cvFile && (
                    <p className="mt-2 text-[11px] text-emerald-600 font-medium">{cvFile.name}</p>
                  )}
                </div>
              </div>

              {/* Single upload button */}
              <Button
                type="button"
                className="w-full"
                onClick={onUploadBoth}
                disabled={!jdFile || !cvFile || uploading}
              >
                {uploading
                  ? 'Uploading\u2026'
                  : !jdFile && !cvFile
                    ? 'Select both files to upload'
                    : !jdFile
                      ? 'Select a JD to continue'
                      : !cvFile
                        ? 'Select a CV to continue'
                        : 'Upload JD & CV'}
              </Button>

              {/* Uploaded docs list */}
              {session.documents && session.documents.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Uploaded files
                  </p>
                  {session.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs"
                    >
                      <Badge variant="success">{doc.doc_type}</Badge>
                      <span className="truncate text-slate-700">{doc.file_name}</span>
                      <span className="ml-auto text-emerald-600">{'\u2713'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {sessionError && <Callout variant="error">{sessionError}</Callout>}
    </div>
  );
};

export default SessionSetupPanel;
