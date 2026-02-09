import React, { useEffect, useRef, useState } from 'react';
import { OpenAIRealtimeWebRTCService } from '../services/openaiRealtimeWebRTCService';
import Badge from './ui/Badge';
import Callout from './ui/Callout';

interface RealtimeInterviewRecorderProps {
  sessionId: string;
  disabled?: boolean;
  onStartRecording?: () => void;
  onStopRecording?: () => Promise<void> | void;
  onTranscriptUpdate?: (text: string, isFinal: boolean) => void;
  onFinalUtterance?: (utterance: string) => void;
  initialTranscript?: string;
}

const RealtimeInterviewRecorder: React.FC<RealtimeInterviewRecorderProps> = ({
  sessionId,
  disabled,
  onStartRecording,
  onStopRecording,
  onTranscriptUpdate,
  onFinalUtterance,
  initialTranscript,
}) => {
  const serviceRef = useRef<OpenAIRealtimeWebRTCService | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;

  useEffect(() => {
    if (initialTranscript !== undefined) {
      setTranscript(initialTranscript);
    }
  }, [initialTranscript, sessionId]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const start = async () => {
    if (disabled || !sessionId) return;
    setError(null);
    onStartRecording?.();
    const service = new OpenAIRealtimeWebRTCService(
      sessionId,
      {
        onTranscript: (text, isFinal) => {
          setTranscript(text);
          onTranscriptUpdate?.(text, isFinal);
        },
        onFinalUtterance: (utterance) => onFinalUtterance?.(utterance),
        onError: (msg) => setError(msg),
        onDisconnect: () => setIsRecording(false),
      },
      { language: 'en' }
    );
    serviceRef.current = service;
    await service.connect();
    setIsRecording(true);
  };

  const stop = async () => {
    await serviceRef.current?.disconnect();
    setIsRecording(false);
    await onStopRecording?.();
  };

  return (
    <div className="space-y-3">
      {/* Controls bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRecording ? (
            <button
              type="button"
              onClick={stop}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg shadow-rose-200 transition hover:bg-rose-700 active:scale-95"
              title="Stop recording"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              disabled={disabled}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-200 transition hover:bg-brand-700 active:scale-95 disabled:opacity-50 disabled:shadow-none"
              title="Start recording"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>
          )}
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {isRecording ? 'Recording in progress' : 'Ready to record'}
            </p>
            <p className="text-[11px] text-slate-400">
              {isRecording
                ? `${wordCount} words captured`
                : 'Click the mic button to start live transcription'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRecording && (
            <Badge variant="error">
              <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
              REC
            </Badge>
          )}
        </div>
      </div>

      {error && <Callout variant="error">{error}</Callout>}

      {/* Transcript area */}
      <div
        className={`max-h-72 min-h-[120px] overflow-y-auto rounded-lg border p-4 transition-colors ${
          isRecording
            ? 'border-rose-200 bg-rose-50/20'
            : 'border-slate-100 bg-slate-50/50'
        }`}
      >
        {transcript ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {transcript}
          </p>
        ) : (
          <p className="text-sm text-slate-400 italic">
            Transcript will appear here once you start recording...
          </p>
        )}
        <div ref={transcriptEndRef} />
      </div>
    </div>
  );
};

export default RealtimeInterviewRecorder;
