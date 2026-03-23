import type { ParsedSession, SessionResponse, SignalSession } from "./types";

const API_BASE = "https://miruns-link.fly.dev";

export async function fetchSession(code: string): Promise<ParsedSession> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(code)}`);
  if (res.status === 404) throw new NotFoundError(code);
  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const json: SessionResponse = await res.json();
  return parseSession(json);
}

function parseSession(raw: SessionResponse): ParsedSession {
  const d = raw.data;

  // signal_session is a JSON string — parse it
  let signal: SignalSession;
  if (typeof d.signal_session === "string") {
    signal = JSON.parse(d.signal_session);
  } else {
    signal = d.signal_session as unknown as SignalSession;
  }

  // tags is a JSON string[]
  let tags: string[] = [];
  try {
    if (typeof d.tags === "string") tags = JSON.parse(d.tags);
  } catch {
    /* empty */
  }

  // Filter out system tags (artifact:, event:)
  const userTags = tags.filter(
    (t) => !t.startsWith("artifact:") && !t.startsWith("event:"),
  );

  // Parse double-encoded optional fields
  const healthData = safeParse(d.health_data);
  const environmentData = safeParse(d.environment_data);

  return {
    code: raw.code,
    createdAt: new Date(raw.createdAt),
    expiresAt: new Date(raw.expiresAt),
    captureId: d.id,
    timestamp: new Date(d.timestamp),
    tags: userTags,
    signal,
    healthData,
    environmentData,
    userNote: d.user_note || undefined,
  };
}

function safeParse(val: unknown): Record<string, unknown> | undefined {
  if (!val || typeof val !== "string") return undefined;
  try {
    return JSON.parse(val);
  } catch {
    return undefined;
  }
}

export class NotFoundError extends Error {
  constructor(code: string) {
    super(`Session "${code}" not found or expired`);
    this.name = "NotFoundError";
  }
}
