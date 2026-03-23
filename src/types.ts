// ── miruns-link API types ────────────────────────────────────────────────────

export interface SessionResponse {
  code: string;
  data: CaptureData;
  dataSize: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

// ── CaptureEntry (from Flutter app, stored in S3) ───────────────────────────

export interface CaptureData {
  id: string;
  timestamp: string;
  source: string;
  tags: string; // JSON-encoded string[]
  signal_session: string; // JSON-encoded SignalSession
  health_data?: string; // JSON-encoded
  environment_data?: string; // JSON-encoded
  user_note?: string;
  user_mood?: string;
  [key: string]: unknown;
}

// ── Signal data ─────────────────────────────────────────────────────────────

export interface SignalSession {
  source_id: string;
  source_name: string;
  device?: string;
  channels: ChannelDescriptor[];
  sample_rate_hz: number;
  samples: SignalSample[];
  // Meta-only fields (when _meta: true)
  _meta?: boolean;
  sample_count?: number;
  duration_ms?: number;
  sparkline?: number[];
}

export interface ChannelDescriptor {
  label: string;
  unit: string;
  default_scale?: number;
}

export interface SignalSample {
  t: number; // microseconds since epoch
  ch: number[]; // one value per channel
}

// ── Parsed convenience types ────────────────────────────────────────────────

export interface ParsedSession {
  code: string;
  createdAt: Date;
  expiresAt: Date;
  captureId: string;
  timestamp: Date;
  tags: string[];
  triggers: string[];
  artifacts: string[];
  signal: SignalSession;
  healthData?: Record<string, unknown>;
  environmentData?: Record<string, unknown>;
  userNote?: string;
  userMood?: string;
}

// ── Event markers ──────────────────────────────────────────────────────────

export interface EventMarker {
  sampleIdx: number;
  label: string;
  kind: "trigger" | "artifact";
}

// ── EEG frequency bands ────────────────────────────────────────────────────

export const EEG_BANDS = {
  delta: { label: "Delta (δ)", range: [0.5, 4], color: "#6366f1" },
  theta: { label: "Theta (θ)", range: [4, 8], color: "#22d3ee" },
  alpha: { label: "Alpha (α)", range: [8, 13], color: "#4ade80" },
  beta: { label: "Beta (β)", range: [13, 30], color: "#facc15" },
  gamma: { label: "Gamma (γ)", range: [30, 100], color: "#f472b6" },
} as const;

export type BandName = keyof typeof EEG_BANDS;
