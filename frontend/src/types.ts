export interface HealthResponse {
  status: string;
  environment: string;
  service: string;
}

export interface User {
  id: number;
  email: string;
  organization_name: string;
  created_at?: string;
}

export interface SessionDocument {
  id: number;
  session_id: number;
  doc_type: string;
  file_name: string;
  gcs_path: string;
}

export interface InterviewSession {
  id: number;
  user_id: number;
  title: string;
  live_transcript?: string;
  final_transcript?: string;
  diarized_transcript?: string;
  documents?: SessionDocument[];
}

export interface ActionButton {
  id: string;
  label: string;
  prompt: string;
}

export interface RagCitation {
  source_type: string;
  chunk_text: string;
  distance: number;
  index?: number;
}
