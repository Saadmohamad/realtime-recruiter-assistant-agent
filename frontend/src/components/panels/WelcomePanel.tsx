import React from 'react';
import Button from '../ui/Button';

interface WelcomePanelProps {
  onStartSession: () => void;
  userName?: string;
}

const WelcomePanel: React.FC<WelcomePanelProps> = ({ onStartSession, userName }) => {
  const greeting = userName ? `Welcome back, ${userName.split('@')[0]}` : 'Welcome';

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/50 p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{greeting}</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Summita Recruiter</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
              Everything your hiring team needs in one workflow.
            </p>
          </div>
        </div>
      </div>

      {/* Recruiter Assistant Agent */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Recruiter Assistant Agent
          </p>
          <div className="h-px flex-1 bg-slate-200" />
        </div>
        {/* Feature cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              title: 'Live transcription',
              desc: 'Capture every word in real time with WebRTC streaming. See the conversation unfold live as you interview, with automatic speaker diarization and instant text updates. Perfect for staying focused while ensuring nothing is missed.',
              color: 'bg-blue-50 text-blue-600',
            },
            {
              title: 'Action prompts',
              desc: 'Get AI-powered follow-up suggestions, skill gap analysis, and evidence checks on demand. Run prompts mid-interview to guide your questions, identify missing information, and verify candidate claims against their CV and the job description.',
              color: 'bg-emerald-50 text-emerald-600',
            },
            {
              title: 'Report + Q&A',
              desc: 'Finalize with a polished diarized transcript that separates interviewer and candidate. Then ask targeted questions against the transcript, CV, and JD to get instant answers about fit, gaps, evidence, and candidate strengths.',
              color: 'bg-violet-50 text-violet-600',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border border-slate-200/80 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"
            >
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition group-hover:scale-105 ${f.color}`}
              >
                {f.title[0]}
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-800">{f.title}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-center pt-2">
          <Button onClick={onStartSession} size="md">Start new session</Button>
        </div>
      </div>

      {/* Coming soon — Automated Agent */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Recruiter Automated Agent
            </p>
            <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-300">
              Coming soon
            </span>
          </div>
          <div className="h-px flex-1 bg-slate-200" />
        </div>
        <div className="rounded-xl border-2 border-dashed border-amber-200 bg-gradient-to-br from-amber-50/50 to-white p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-base font-bold text-amber-700 shadow-sm">
              A
            </span>
            <div className="flex-1">
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-600">
                Let the AI run the entire interview autonomously. The automated agent processes multiple
                job descriptions and candidate CVs, conducts structured interviews end-to-end, drives
                conversations to find the best match, and performs automatic analysis using CVs, JDs,
                and interview transcripts to deliver scored evaluation reports. No human interviewer needed.
              </p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {[
                  'Process multiple JDs and CVs to find optimal matches',
                  'Drive interviews autonomously to assess best fit',
                  'Match candidates using CVs, JDs, and interview transcripts',
                  'Perform automatic analysis and scoring against requirements',
                  'Generate comprehensive match reports with scoring',
                  'Scale screening across hundreds of candidates simultaneously',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-slate-600">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomePanel;
