import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Health check API
export const healthAPI = {
  check: () => api.get('/health'),
};

export const authAPI = {
  register: (payload: { email: string; password: string; organization_name: string }) =>
    api.post('/api/auth/register', payload),
  login: (payload: { email: string; password: string }) =>
    api.post('/api/auth/login', payload),
  me: () => api.get('/api/auth/me'),
};

export const sessionsAPI = {
  list: () => api.get('/api/sessions'),
  create: (payload: { title: string }) => api.post('/api/sessions', payload),
  uploadDocument: (sessionId: number, docType: 'JD' | 'CV', file: File) => {
    const form = new FormData();
    form.append('doc_type', docType);
    form.append('file', file);
    return api.post(`/api/sessions/${sessionId}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  get: (sessionId: number) => api.get(`/api/sessions/${sessionId}`),
};

export const realtimeAPI = {
  createSession: (payload: { sessionId: string; language?: string; model?: string }) =>
    api.post('/api/realtime/session', payload),
};

export const interviewAPI = {
  uploadAudio: (sessionId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/api/interview/sessions/${sessionId}/audio`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  updateTranscript: (
    sessionId: number,
    payload: { final_utterance?: string; final_transcript?: string; metadata?: Record<string, any> }
  ) => api.put(`/api/interview/sessions/${sessionId}/transcript`, payload),
  executeAction: (
    sessionId: number,
    payload: {
      action_button: { id?: string; label: string; prompt: string };
      client_transcript: string;
      metadata?: Record<string, any>;
    }
  ) => api.post(`/api/interview/sessions/${sessionId}/action`, payload),
  chat: (sessionId: number, payload: { question: string; top_k?: number }) =>
    api.post(`/api/interview/sessions/${sessionId}/chat`, payload),
  finalize: (sessionId: number) => api.post(`/api/interview/sessions/${sessionId}/finalize`),
};
