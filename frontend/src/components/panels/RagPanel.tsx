import React from 'react';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import Callout from '../ui/Callout';
import Badge from '../ui/Badge';
import { RagCitation } from '../../types';

interface RagPanelProps {
  ragQuestion: string;
  ragAnswer: string;
  ragCitations: RagCitation[];
  ragLoading: boolean;
  ragError: string | null;
  onQuestionChange: (value: string) => void;
  onAsk: () => void;
}

const EXAMPLE_QUESTIONS = [
  'Does the candidate meet the JD requirements?',
  'What are the main skill gaps?',
  'Summarize the candidate\u2019s strengths',
];

const RagPanel: React.FC<RagPanelProps> = ({
  ragQuestion,
  ragAnswer,
  ragCitations,
  ragLoading,
  ragError,
  onQuestionChange,
  onAsk,
}) => (
  <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
    {/* Header */}
    <div className="border-b border-slate-100 px-5 py-4">
      <h3 className="text-sm font-semibold text-slate-900">Q&amp;A</h3>
      <p className="text-xs text-slate-500">
        Ask questions against the transcript, CV, and job description.
      </p>
    </div>

    {/* Input area */}
    <div className="border-b border-slate-100 px-5 py-4 space-y-3">
      <Textarea
        rows={2}
        placeholder="Ask about candidate fit, gaps, or evidence\u2026"
        value={ragQuestion}
        onChange={(e) => onQuestionChange(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={onAsk}
          disabled={ragLoading || !ragQuestion.trim()}
        >
          {ragLoading ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Thinking\u2026
            </span>
          ) : (
            'Ask'
          )}
        </Button>
        {!ragQuestion.trim() && !ragAnswer && (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onQuestionChange(q)}
                className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-500 transition hover:bg-brand-50 hover:text-brand-600"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Results */}
    <div className="px-5 py-4 space-y-4">
      {ragError && <Callout variant="error">{ragError}</Callout>}

      {ragAnswer ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Answer</p>
            <Badge variant="info">AI</Badge>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-blue-100 bg-blue-50/30 p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {ragAnswer}
            </p>
          </div>
        </div>
      ) : !ragError ? (
        <p className="text-center text-xs text-slate-400 py-2">
          Ask a question to get AI-powered answers grounded in your session data.
        </p>
      ) : null}

      {/* Citations */}
      {ragCitations.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Sources
          </p>
          <div className="space-y-1.5">
            {(() => {
              const cited = new Set<number>();
              const regex = /\[(\d+)\]/g;
              let match: RegExpExecArray | null;
              while ((match = regex.exec(ragAnswer)) !== null) {
                const num = Number(match[1]);
                if (!Number.isNaN(num)) cited.add(num);
              }
              const withIndex = ragCitations.map((c, idx) => ({
                ...c,
                _displayIndex: c.index ?? idx + 1,
              }));
              const filtered = cited.size
                ? withIndex.filter((c) => cited.has(c._displayIndex))
                : withIndex;
              return filtered.map((c) => (
                <div
                  key={`${c.source_type}-${c._displayIndex}`}
                  className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-brand-600">
                    [{c._displayIndex}]
                  </span>{' '}
                  <Badge variant="neutral">{c.source_type}</Badge>{' '}
                  <span className="text-slate-600">{c.chunk_text}</span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  </div>
);

export default RagPanel;
