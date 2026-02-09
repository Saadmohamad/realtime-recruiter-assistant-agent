import React, { useState, useEffect } from 'react';
import { authAPI, sessionsAPI, interviewAPI } from './services/api';
import Layout from './components/layout/Layout';
import RealtimeInterviewRecorder from './components/RealtimeInterviewRecorder';
import AuthPanel from './components/panels/AuthPanel';
import SessionSetupPanel from './components/panels/SessionSetupPanel';
import ActionButtonsPanel from './components/panels/ActionButtonsPanel';
import FinalizePanel from './components/panels/FinalizePanel';
import RagPanel from './components/panels/RagPanel';
import WelcomePanel from './components/panels/WelcomePanel';
import Card from './components/ui/Card';
import Button from './components/ui/Button';
import Badge from './components/ui/Badge';
import Callout from './components/ui/Callout';
import { ActionButton, RagCitation, InterviewSession, User } from './types';

const DEFAULT_ACTION_BUTTONS: ActionButton[] = [
  {
    id: 'next_question',
    label: 'Next question',
    prompt:
      'Based on the JD requirements and what has already been discussed in the transcript, suggest the single best next interview question to ask. Focus on JD requirements that have not been adequately covered yet. Provide the question and a one-sentence rationale for why it matters.',
  },
  {
    id: 'probe_deeper',
    label: 'Probe deeper',
    prompt:
      'Look at the most recent part of the transcript. Identify where the candidate gave vague, incomplete, or unsubstantiated answers. Suggest 2\u20133 specific follow-up questions using the STAR method (Situation, Task, Action, Result) to get concrete examples and measurable evidence.',
  },
  {
    id: 'red_flags',
    label: 'Red flags',
    prompt:
      'Analyze the transcript for potential red flags: inconsistencies between what the candidate said and their CV, vague or evasive answers to critical JD requirements, missing experience for must-have skills, or concerning patterns. Be specific about what raised each concern and suggest a clarifying question for each.',
  },
  {
    id: 'coverage_check',
    label: 'Coverage check',
    prompt:
      'Compare the JD requirements against what has been discussed in the transcript so far. List: (1) Requirements well-covered with evidence, (2) Requirements mentioned but needing more depth, (3) Requirements not yet discussed. Prioritize what to cover in the remaining interview time.',
  },
  {
    id: 'quick_assessment',
    label: 'Quick assessment',
    prompt:
      'Give a mid-interview pulse check: overall impression so far, top 3 strengths demonstrated, top 2\u20133 concerns or gaps, and a preliminary fit rating (Strong / Good / Moderate / Weak) with a brief justification based on transcript evidence.',
  },
];

const ACTION_COOLDOWN_MS = 2000;

type AppTab = 'welcome' | 'assistant' | 'sessions';
type SessionStep = 'setup' | 'record' | 'finalize';

interface SavedSession {
  id: number;
  user_id: number;
  title: string;
  created_at?: string;
}

function App() {
  // --- auth ---
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // --- session ---
  const [sessionTitle, setSessionTitle] = useState('');
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // --- recording ---
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUploaded, setAudioUploaded] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [diarizedTranscript, setDiarizedTranscript] = useState('');
  const [realtimeTranscript, setRealtimeTranscript] = useState('');

  // --- actions ---
  const [actionButtons, setActionButtons] = useState<ActionButton[]>(DEFAULT_ACTION_BUTTONS);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionOutput, setActionOutput] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionCooldownUntil, setActionCooldownUntil] = useState(0);

  // --- rag ---
  const [ragQuestion, setRagQuestion] = useState('');
  const [ragAnswer, setRagAnswer] = useState('');
  const [ragCitations, setRagCitations] = useState<RagCitation[]>([]);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragError, setRagError] = useState<string | null>(null);

  // --- saved sessions ---
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [savedSessionsLoading, setSavedSessionsLoading] = useState(false);

  // --- refs ---
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  // --- navigation ---
  const [activeTab, setActiveTab] = useState<AppTab>('welcome');
  const [activeStep, setActiveStep] = useState<SessionStep>('setup');

  // ============ effects ============

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    authAPI
      .me()
      .then((res) => setCurrentUser(res.data))
      .catch(() => {
        localStorage.removeItem('token');
        setCurrentUser(null);
      });
  }, []);

  useEffect(() => {
    if (!session) return;
    setRealtimeTranscript(session.live_transcript || session.final_transcript || '');
  }, [session]);

  useEffect(() => {
    if (!currentUser) return;
    const storedSessionId = localStorage.getItem('activeSessionId');
    if (!storedSessionId) return;
    sessionsAPI
      .get(Number(storedSessionId))
      .then((res) => setSession(res.data))
      .catch(() => localStorage.removeItem('activeSessionId'));
  }, [currentUser]);

  // Auto-advance step
  const hasSetup = Boolean(currentUser && session);
  const sessionDocs = session?.documents || [];
  const hasJD = sessionDocs.some((d) => d.doc_type === 'JD');
  const hasCV = sessionDocs.some((d) => d.doc_type === 'CV');
  const hasDocsReady = hasSetup && hasJD && hasCV;
  const hasRecordingData = Boolean(realtimeTranscript.trim());
  const hasFinalized = Boolean(diarizedTranscript.trim());

  useEffect(() => {
    if (hasFinalized) { setActiveStep('finalize'); return; }
    if (hasRecordingData) { setActiveStep('record'); return; }
    if (hasDocsReady) { setActiveStep('record'); return; }
    setActiveStep('setup');
  }, [hasFinalized, hasRecordingData, hasDocsReady]);

  // Sync tab with URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'assistant' || tab === 'welcome' || tab === 'sessions') {
      setActiveTab(tab);
      if (tab === 'sessions') fetchSavedSessions();
    }
  }, []);

  const fetchSavedSessions = async () => {
    try {
      setSavedSessionsLoading(true);
      const { data } = await sessionsAPI.list();
      setSavedSessions(data);
    } catch {
      setSavedSessions([]);
    } finally {
      setSavedSessionsLoading(false);
    }
  };

  const navigate = (tab: AppTab) => {
    setActiveTab(tab);
    if (tab === 'sessions') fetchSavedSessions();
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tab);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  // ============ handlers ============

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setAuthLoading(true);
      setAuthError(null);
      const { data } = await authAPI.login({ email, password });
      localStorage.setItem('token', data.access_token);
      const me = await authAPI.me();
      setCurrentUser(me.data);
    } catch (err: any) {
      setAuthError(err.response?.data?.detail || 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setAuthLoading(true);
      setAuthError(null);
      await authAPI.register({ email, password, organization_name: organizationName });
      const { data } = await authAPI.login({ email, password });
      localStorage.setItem('token', data.access_token);
      const me = await authAPI.me();
      setCurrentUser(me.data);
    } catch (err: any) {
      setAuthError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('activeSessionId');
    setCurrentUser(null);
    setSession(null);
    setRealtimeTranscript('');
    setActionButtons(DEFAULT_ACTION_BUTTONS);
    setActionOutput('');
    setActionError(null);
    setActionCooldownUntil(0);
    setRagQuestion('');
    setRagAnswer('');
    setRagCitations([]);
    setRagError(null);
    navigate('welcome');
  };

  const persistFinalUtterance = async (utterance: string) => {
    if (!session || !utterance.trim()) return;
    try {
      await interviewAPI.updateTranscript(session.id, { final_utterance: utterance });
    } catch (err: any) {
      setSessionError(err.response?.data?.detail || 'Failed to persist utterance');
    }
  };

  const persistFinalTranscript = async (finalText: string) => {
    if (!session) return;
    try {
      await interviewAPI.updateTranscript(session.id, { final_transcript: finalText });
    } catch (err: any) {
      setSessionError(err.response?.data?.detail || 'Failed to persist final transcript');
    }
  };

  const updateActionButton = (index: number, field: 'label' | 'prompt', value: string) => {
    setActionButtons((prev) =>
      prev.map((btn, i) => (i === index ? { ...btn, [field]: value } : btn))
    );
  };
  const addActionButton = () => {
    setActionButtons((prev) => [
      ...prev,
      { id: `custom_${Date.now()}`, label: 'New action', prompt: 'Describe the action.' },
    ]);
  };
  const removeActionButton = (index: number) => {
    setActionButtons((prev) => prev.filter((_, i) => i !== index));
  };

  const executeAction = async (button: ActionButton) => {
    if (!session) return;
    if (!realtimeTranscript.trim()) { setActionError('Transcript is empty.'); return; }
    if (Date.now() < actionCooldownUntil) { setActionError('Cooling down.'); return; }
    try {
      setActionLoading(true);
      setActionError(null);
      const expiresAt = Date.now() + ACTION_COOLDOWN_MS;
      setActionCooldownUntil(expiresAt);
      window.setTimeout(() => setActionCooldownUntil(0), ACTION_COOLDOWN_MS);
      const { data } = await interviewAPI.executeAction(session.id, {
        action_button: { id: button.id, label: button.label, prompt: button.prompt },
        client_transcript: realtimeTranscript,
      });
      setActionOutput(data.output || '');
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRagAsk = async () => {
    if (!session) return;
    const question = ragQuestion.trim();
    if (!question) return;
    try {
      setRagLoading(true);
      setRagError(null);
      const { data } = await interviewAPI.chat(session.id, { question });
      setRagAnswer(data.answer || '');
      setRagCitations(data.citations || []);
    } catch (err: any) {
      setRagError(err.response?.data?.detail || 'RAG chat failed');
    } finally {
      setRagLoading(false);
    }
  };

  const startRecording = async () => {
    if (!session || recording) return;
    setSessionError(null);
    setAudioUploaded(false);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      setAudioBlob(blob);
      chunksRef.current = [];
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  };

  const stopRecording = async (): Promise<Blob | null> => {
    if (!mediaRecorderRef.current) { setRecording(false); return audioBlob; }
    const recorder = mediaRecorderRef.current;
    const stopPromise = new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        chunksRef.current = [];
        resolve(blob);
      };
    });
    recorder.stop();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    setRecording(false);
    return await stopPromise;
  };

  const uploadAudio = async (blobOverride?: Blob | null) => {
    if (!session) return;
    const blobToUpload = blobOverride || audioBlob;
    if (!blobToUpload) return;
    try {
      setUploading(true);
      setSessionError(null);
      const file = new File([blobToUpload], 'interview_audio.webm', { type: 'audio/webm' });
      await interviewAPI.uploadAudio(session.id, file);
      setAudioUploaded(true);
    } catch (err: any) {
      setSessionError(err.response?.data?.detail || 'Audio upload failed');
    } finally {
      setUploading(false);
    }
  };

  const finalizeInterview = async () => {
    if (!session) return;
    try {
      setFinalizing(true);
      setSessionError(null);
      const { data } = await interviewAPI.finalize(session.id);
      setDiarizedTranscript(data.diarized_transcript || '');
      fetchSavedSessions();
    } catch (err: any) {
      setSessionError(err.response?.data?.detail || 'Finalize failed');
    } finally {
      setFinalizing(false);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionTitle.trim()) return;
    try {
      setSessionLoading(true);
      setSessionError(null);
      const { data } = await sessionsAPI.create({ title: sessionTitle.trim() });
      setSession(data);
      localStorage.setItem('activeSessionId', String(data.id));
      setRealtimeTranscript(data.live_transcript || data.final_transcript || '');
      setActionButtons(DEFAULT_ACTION_BUTTONS);
      setActionOutput('');
      setActionError(null);
      setActionCooldownUntil(0);
      setRagQuestion('');
      setRagAnswer('');
      setRagCitations([]);
      setRagError(null);
    } catch (err: any) {
      setSessionError(err.response?.data?.detail || 'Failed to create session');
    } finally {
      setSessionLoading(false);
    }
  };

  const handleUploadBoth = async () => {
    if (!session || !jdFile || !cvFile) return;
    try {
      setUploading(true);
      setSessionError(null);
      await sessionsAPI.uploadDocument(session.id, 'JD', jdFile);
      await sessionsAPI.uploadDocument(session.id, 'CV', cvFile);
      const refreshed = await sessionsAPI.get(session.id);
      setSession(refreshed.data);
    } catch (err: any) {
      setSessionError(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ============ step config ============

  const steps: { id: SessionStep; label: string; description: string; status: string }[] = [
    { id: 'setup', label: 'Setup', description: 'Create session & upload docs', status: hasDocsReady ? 'complete' : 'current' },
    { id: 'record', label: 'Interview', description: 'Record & run actions', status: hasRecordingData ? 'complete' : hasDocsReady ? 'current' : 'upcoming' },
    { id: 'finalize', label: 'Report', description: 'Diarized transcript & Q&A', status: hasFinalized ? 'complete' : hasRecordingData ? 'current' : 'upcoming' },
  ];

  const wordCount = realtimeTranscript.split(/\s+/).filter(w => w.length > 0).length;

  // ============ render ============

  return (
    <Layout
      brand="Summita Recruiter"
      tagline="Structured interviews"
      userEmail={currentUser?.email}
      organizationName={currentUser?.organization_name}
      onLogout={handleLogout}
      onBrandClick={() => navigate('welcome')}
      navItems={
        currentUser
          ? [
              { id: 'assistant', label: 'Recruiter Assistant Agent', active: activeTab === 'assistant', onClick: () => navigate('assistant'), section: 'Agents' },
              { id: 'automated', label: 'Recruiter Automated Agent', disabled: true, badge: 'Soon', section: 'Agents' },
              { id: 'sessions', label: 'Saved Sessions', active: activeTab === 'sessions', onClick: () => navigate('sessions'), section: 'History' },
            ]
          : []
      }
    >
      {/* -------- LOGIN -------- */}
      {!currentUser && (
        <div className="flex min-h-[70vh] items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            <div className="text-center">
              <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
                S
              </span>
              <h1 className="text-lg font-bold text-slate-900">Summita Recruiter</h1>
              <p className="mt-1 text-xs text-slate-500">
                Sign in to your interview workspace.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white p-5">
              <AuthPanel
                currentUser={currentUser}
                authMode={authMode}
                email={email}
                password={password}
                organizationName={organizationName}
                authLoading={authLoading}
                authError={authError}
                onEmailChange={setEmail}
                onPasswordChange={setPassword}
                onOrganizationChange={setOrganizationName}
                onAuthModeChange={setAuthMode}
                onLogin={handleLogin}
                onRegister={handleRegister}
              />
            </div>
          </div>
        </div>
      )}

      {/* -------- WELCOME -------- */}
      {currentUser && activeTab === 'welcome' && (
        <WelcomePanel
          onStartSession={() => navigate('assistant')}
          userName={currentUser.email}
        />
      )}

      {/* -------- ASSISTANT FLOW -------- */}
      {currentUser && activeTab === 'assistant' && (
        <div className="space-y-6">
          {/* Session header */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  {session ? session.title : 'New Session'}
                </h1>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  {session && (
                    <>
                      <Badge variant="success">Active</Badge>
                      <span>Session #{session.id}</span>
                      <span className="text-slate-300">|</span>
                    </>
                  )}
                  {recording && (
                    <>
                      <Badge variant="error">REC</Badge>
                      <span>{wordCount} words</span>
                      <span className="text-slate-300">|</span>
                    </>
                  )}
                  <span>
                    {activeStep === 'setup' ? 'Configure your session' :
                     activeStep === 'record' ? 'Recording & live guidance' :
                     'Generate report & Q\u0026A'}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Reset all session state
                  setSession(null);
                  setSessionTitle('');
                  setSessionError(null);
                  setJdFile(null);
                  setCvFile(null);
                  setRealtimeTranscript('');
                  setRecording(false);
                  setAudioBlob(null);
                  setAudioUploaded(false);
                  setDiarizedTranscript('');
                  setActionButtons(DEFAULT_ACTION_BUTTONS);
                  setActionOutput('');
                  setActionError(null);
                  setActionCooldownUntil(0);
                  setRagQuestion('');
                  setRagAnswer('');
                  setRagCitations([]);
                  setRagError(null);
                  setActiveStep('setup');
                  localStorage.removeItem('activeSessionId');
                  navigate('welcome');
                }}
              >
                Exit session
              </Button>
            </div>
          </div>

          {/* Step bar */}
          <div className="rounded-xl border border-slate-200/80 bg-white px-2 py-2">
            <div className="grid grid-cols-3 gap-1">
              {steps.map((step, i) => {
                const isActive = activeStep === step.id;
                const isComplete = step.status === 'complete';
                const isUpcoming = step.status === 'upcoming';
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => !isUpcoming && setActiveStep(step.id)}
                    disabled={isUpcoming}
                    className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left transition ${
                      isActive
                        ? 'bg-brand-50 ring-1 ring-brand-200'
                        : isComplete
                          ? 'bg-emerald-50/50 hover:bg-emerald-50'
                          : 'hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isComplete
                          ? 'bg-emerald-600 text-white'
                          : isActive
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {isComplete ? '\u2713' : i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${
                        isActive ? 'text-brand-700' :
                        isComplete ? 'text-emerald-700' :
                        'text-slate-400'
                      }`}>
                        {step.label}
                      </p>
                      <p className="text-[11px] text-slate-400">{step.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Onboarding hint */}
          {!session && activeStep === 'setup' && (
            <Callout variant="info" title="Quick start">
              Name your session, customize action buttons, then upload a JD and CV. Once ready, move to the Interview step.
            </Callout>
          )}

          {/* ---- SETUP ---- */}
          {activeStep === 'setup' && (
            <SessionSetupPanel
              currentUser={currentUser}
              sessionTitle={sessionTitle}
              sessionLoading={sessionLoading}
              session={session}
              actionButtons={actionButtons}
              uploading={uploading}
              sessionError={sessionError}
              jdFile={jdFile}
              cvFile={cvFile}
              onSessionTitleChange={setSessionTitle}
              onCreateSession={handleCreateSession}
              onUpdateActionButton={updateActionButton}
              onRemoveActionButton={removeActionButton}
              onAddActionButton={addActionButton}
              onJdFileChange={setJdFile}
              onCvFileChange={setCvFile}
              onUploadBoth={handleUploadBoth}
            />
          )}

          {/* ---- RECORD ---- */}
          {activeStep === 'record' && (
            <>
              {session ? (
                <div className="space-y-4">
                  {/* Recording panel */}
                  <div className={`rounded-xl border-2 transition-all ${
                    recording
                      ? 'border-rose-300 bg-rose-50/30'
                      : 'border-slate-200/80 bg-white'
                  }`}>
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className={`h-2 w-2 rounded-full ${recording ? 'bg-rose-500 animate-pulse' : 'bg-slate-300'}`} />
                        <span>{recording ? 'Connected to transcription service' : 'Ready to record'}</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {wordCount > 0 && <span>Words: {wordCount}</span>}
                      </div>
                    </div>
                    <div className="p-4">
                      <RealtimeInterviewRecorder
                        sessionId={String(session.id)}
                        onStartRecording={startRecording}
                        onStopRecording={async () => {
                          const blob = await stopRecording();
                          await uploadAudio(blob);
                          await persistFinalTranscript(realtimeTranscript);
                          setActiveStep('finalize');
                        }}
                        onTranscriptUpdate={(text) => setRealtimeTranscript(text)}
                        onFinalUtterance={(utterance) => persistFinalUtterance(utterance)}
                        initialTranscript={realtimeTranscript}
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <ActionButtonsPanel
                    actionButtons={actionButtons}
                    actionLoading={actionLoading}
                    actionCooldownUntil={actionCooldownUntil}
                    actionOutput={actionOutput}
                    actionError={actionError}
                    onExecuteAction={executeAction}
                  />
                </div>
              ) : (
                <Card title="Interview" compact>
                  <Callout variant="warning">
                    Go back to Setup and create a session first.
                  </Callout>
                  <div className="mt-3">
                    <Button size="sm" variant="secondary" onClick={() => setActiveStep('setup')}>
                      Go to Setup
                    </Button>
                  </div>
                </Card>
              )}
            </>
          )}

          {/* ---- FINALIZE ---- */}
          {activeStep === 'finalize' && (
            <>
              {session ? (
                <div className="space-y-4">
                  {/* Finalize */}
                  <FinalizePanel
                    recording={recording}
                    audioBlob={audioBlob}
                    audioUploaded={audioUploaded}
                    uploading={uploading}
                    finalizing={finalizing}
                    diarizedTranscript={diarizedTranscript}
                    onUploadAudio={() => uploadAudio()}
                    onFinalize={finalizeInterview}
                  />

                  {/* Q&A */}
                  <RagPanel
                    ragQuestion={ragQuestion}
                    ragAnswer={ragAnswer}
                    ragCitations={ragCitations}
                    ragLoading={ragLoading}
                    ragError={ragError}
                    onQuestionChange={setRagQuestion}
                    onAsk={handleRagAsk}
                  />
                </div>
              ) : (
                <Card title="Report" compact>
                  <Callout variant="warning">
                    Complete an interview session first.
                  </Callout>
                  <div className="mt-3">
                    <Button size="sm" variant="secondary" onClick={() => setActiveStep('setup')}>
                      Go to Setup
                    </Button>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* -------- SAVED SESSIONS -------- */}
      {currentUser && activeTab === 'sessions' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200/80 bg-white p-5">
            <h1 className="text-xl font-bold text-slate-900">Saved Sessions</h1>
            <p className="mt-1 text-xs text-slate-500">
              Sessions appear here once you generate the diarized transcript in the Report step.
            </p>
          </div>

          {savedSessionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
              <span className="ml-3 text-sm text-slate-500">Loading sessions…</span>
            </div>
          ) : savedSessions.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
              <p className="text-sm text-slate-500">No saved sessions yet.</p>
              <p className="mt-1 text-xs text-slate-400">
                Complete an interview and generate the diarized transcript to save it here.
              </p>
              <Button
                className="mt-4"
                size="sm"
                onClick={() => navigate('assistant')}
              >
                Start new session
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {savedSessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={async () => {
                    try {
                      const { data } = await sessionsAPI.get(s.id);
                      setSession(data);
                      localStorage.setItem('activeSessionId', String(data.id));
                      setRealtimeTranscript(data.live_transcript || data.final_transcript || '');
                      setDiarizedTranscript(data.diarized_transcript || '');
                      navigate('assistant');
                    } catch {
                      setSessionError('Failed to load session');
                    }
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200/80 bg-white px-5 py-4 text-left transition hover:border-brand-300 hover:shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{s.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Session #{s.id}
                      {s.created_at && (
                        <span> · {new Date(s.created_at).toLocaleDateString()}</span>
                      )}
                    </p>
                  </div>
                  <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}

export default App;
