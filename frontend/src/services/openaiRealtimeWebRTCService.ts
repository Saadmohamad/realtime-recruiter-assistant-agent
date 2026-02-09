export interface RealtimeCallbacks {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onFinalUtterance?: (utterance: string) => void;
  onError?: (message: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export interface RealtimeSettings {
  language?: string;
  model?: string;
}

interface RealtimeSessionResponse {
  session_id: string;
  client_token: string;
  expires_in: number;
  webrtc_sdp_url?: string;
}

export class OpenAIRealtimeWebRTCService {
  private sessionId: string;
  private callbacks: RealtimeCallbacks;
  private settings: RealtimeSettings;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private clientToken: string | null = null;
  private webrtcSdpUrl: string | null = null;
  private finalText = '';
  private partialText = '';

  constructor(sessionId: string, callbacks: RealtimeCallbacks = {}, settings: RealtimeSettings = {}) {
    this.sessionId = sessionId;
    this.callbacks = callbacks;
    this.settings = { language: 'en', ...settings };
  }

  async connect(): Promise<void> {
    try {
      await this.createRealtimeSession();
      await this.createWebRTCConnection();
    } catch (err: any) {
      this.callbacks.onError?.(err?.message || 'Failed to connect to realtime');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.dataChannel?.close();
      this.peerConnection?.close();
      this.micStream?.getTracks().forEach((t) => t.stop());
    } finally {
      this.dataChannel = null;
      this.peerConnection = null;
      this.micStream = null;
      this.callbacks.onDisconnect?.();
    }
  }

  private async createRealtimeSession(): Promise<void> {
    const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    const authToken = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/api/realtime/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        sessionId: this.sessionId,
        language: this.settings.language,
        model: this.settings.model,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Realtime session error: ${response.status} ${errorText}`);
    }

    const data: RealtimeSessionResponse = await response.json();
    this.clientToken = data.client_token;
    this.webrtcSdpUrl = data.webrtc_sdp_url || null;
  }

  private async createWebRTCConnection(): Promise<void> {
    if (!this.clientToken) {
      throw new Error('Missing realtime client token');
    }

    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    this.dataChannel = this.peerConnection.createDataChannel('oai-events', {
      ordered: true,
    });
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      this.callbacks.onConnect?.();
    };

    this.dataChannel.onclose = () => {
      this.callbacks.onDisconnect?.();
    };

    this.dataChannel.onmessage = (event) => {
      const raw = event.data;
      try {
        if (typeof raw === 'string') {
          this.handleMessage(JSON.parse(raw));
        } else if (raw instanceof ArrayBuffer) {
          const text = new TextDecoder().decode(raw);
          this.handleMessage(JSON.parse(text));
        }
      } catch {
        // ignore non-json frames
      }
    };

    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.micStream.getTracks().forEach((track) => {
      this.peerConnection?.addTrack(track, this.micStream as MediaStream);
    });

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    const sdpUrl = this.webrtcSdpUrl || 'https://api.openai.com/v1/realtime/calls';
    let answerSdp = await this.postSdp(sdpUrl, offer.sdp || '');
    if (!answerSdp) {
      // fallback with beta header
      answerSdp = await this.postSdp(sdpUrl, offer.sdp || '', true);
    }

    await this.peerConnection.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  }

  private async postSdp(url: string, sdp: string, withBetaHeader = false): Promise<string> {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.clientToken}`,
        'Content-Type': 'application/sdp',
        ...(withBetaHeader ? { 'OpenAI-Beta': 'realtime=v1' } : {}),
      },
      body: sdp,
    });
    if (!res.ok) return '';
    return await res.text();
  }

  private handleMessage(message: any): void {
    const type = message?.type;
    if (
      type === 'conversation.item.input_audio_transcription.delta' ||
      type === 'input_audio_transcription.delta' ||
      type === 'audio.input.transcription.delta' ||
      type === 'transcription.delta'
    ) {
      const delta = message?.delta || message?.text || '';
      if (!delta) return;
      this.partialText += delta;
      this.callbacks.onTranscript?.(this.finalText + this.partialText, false);
      return;
    }

    if (
      type === 'conversation.item.input_audio_transcription.completed' ||
      type === 'input_audio_transcription.completed' ||
      type === 'audio.input.transcription.completed' ||
      type === 'transcription.completed'
    ) {
      const transcript = message?.transcript || message?.text || '';
      if (!transcript) return;
      this.finalText = this.finalText ? `${this.finalText}\n${transcript}` : transcript;
      this.partialText = '';
      this.callbacks.onFinalUtterance?.(transcript);
      this.callbacks.onTranscript?.(this.finalText, true);
    }
  }
}
