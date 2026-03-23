import { fetchSession, NotFoundError } from "./api";
import { drawBands } from "./charts/bands";
import { drawSpectrum } from "./charts/spectrum";
import { drawWaveform } from "./charts/waveform";
import type { ParsedSession, SignalSession } from "./types";

// ── State ──────────────────────────────────────────────────────────────────

let session: ParsedSession | null = null;
let activeChannels: number[] = [];
let selectedChannel = 0;
let viewStart = 0;
let viewEnd = 10;
let totalDuration = 0;

// ── Router ─────────────────────────────────────────────────────────────────

export function init(): void {
  const path = window.location.pathname.replace(/^\/+/, "");
  if (!path) {
    showLanding();
    return;
  }
  loadSession(path);
}

async function loadSession(code: string): Promise<void> {
  showLoading();
  try {
    session = await fetchSession(code);
    renderSession();
  } catch (err) {
    if (err instanceof NotFoundError) {
      showError(
        "Session not found",
        "This session may have expired or the link is invalid.",
      );
    } else {
      showError("Failed to load session", String(err));
    }
  }
}

// ── Render functions ───────────────────────────────────────────────────────

function showLoading(): void {
  app().innerHTML = `
    <div class="state-screen">
      <div class="spinner"></div>
      <p>Loading session…</p>
    </div>`;
}

function showError(title: string, detail: string): void {
  app().innerHTML = `
    <div class="state-screen">
      <h2>${esc(title)}</h2>
      <p class="muted">${esc(detail)}</p>
      <a href="/" class="btn">Home</a>
    </div>`;
}

function showLanding(): void {
  app().innerHTML = `
    <div class="state-screen landing">
      <svg class="landing-logo" viewBox="0 0 100 82" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g-msignal" x1="0" y1="40" x2="100" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#00D2FF"/>
            <stop offset="100%" stop-color="#9D50BB"/>
          </linearGradient>
        </defs>
        <path d="M 0 56 C 7 56, 10 10, 22 10 C 34 10, 42 72, 50 72 C 58 72, 66 10, 78 10 C 90 10, 93 56, 100 56"
              stroke="url(#g-msignal)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg><span class="accent">share</span>
      <h1>miruns</h1>
      <p class="tagline">View shared EEG sessions from the Miruns app.</p>
      <p class="hint">Paste a shared link in the address bar to get started.</p>
    </div>`;
}

function renderSession(): void {
  if (!session) return;
  const s = session.signal;
  const hasSamples = s.samples.length > 0;

  // Init channels
  activeChannels = s.channels.map((_, i) => i);
  selectedChannel = 0;

  // Total duration
  if (hasSamples) {
    totalDuration = (s.samples[s.samples.length - 1].t - s.samples[0].t) / 1e6;
    viewEnd = Math.min(10, totalDuration);
  }

  app().innerHTML = `
    <header class="session-header">
      <div class="header-left">
        <h1>${esc(s.source_name || "Session")}</h1>
        <span class="muted">${esc(session.code)}</span>
      </div>
      <div class="header-right">
        <div class="meta-item"><span class="label">Device</span><span>${esc(s.device || "Unknown")}</span></div>
        <div class="meta-item"><span class="label">Channels</span><span>${s.channels.length}</span></div>
        <div class="meta-item"><span class="label">Sample Rate</span><span>${s.sample_rate_hz} Hz</span></div>
        ${hasSamples ? `<div class="meta-item"><span class="label">Duration</span><span>${formatDuration(totalDuration)}</span></div>` : ""}
        <div class="meta-item"><span class="label">Recorded</span><span>${session.timestamp.toLocaleDateString()}</span></div>
        <div class="meta-item"><span class="label">Expires</span><span>${timeUntil(session.expiresAt)}</span></div>
      </div>
    </header>

    ${session.tags.length ? `<div class="tags">${session.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    ${session.userNote ? `<div class="note"><span class="label">Note</span> ${esc(session.userNote)}</div>` : ""}

    ${hasSamples ? renderSignalCharts(s) : renderMetaOnly(s)}

    ${renderHealth(session)}

    <footer class="footer">
      <span class="muted small">Shared via <a href="https://miruns.com" target="_blank" rel="noopener">Miruns</a></span>
    </footer>
  `;

  if (hasSamples) {
    setupInteractions(s);
  }
}

function renderSignalCharts(_s: SignalSession): string {
  return `
    <section class="chart-section">
      <div class="section-head">
        <h2>Waveform</h2>
        <div class="channel-toggles" id="ch-toggles"></div>
      </div>
      <canvas id="waveform-canvas" class="chart-canvas tall"></canvas>
      <div class="time-nav" id="time-nav">
        <button id="nav-left" class="btn-icon" title="Pan left">◀</button>
        <input type="range" id="time-slider" min="0" max="100" value="0" />
        <button id="nav-right" class="btn-icon" title="Pan right">▶</button>
        <select id="zoom-select">
          <option value="2">2s</option>
          <option value="5">5s</option>
          <option value="10" selected>10s</option>
          <option value="30">30s</option>
          <option value="0">All</option>
        </select>
      </div>
    </section>

    <section class="chart-section row">
      <div class="chart-half">
        <div class="section-head">
          <h2>Spectrum</h2>
          <select id="spectrum-ch-select" class="ch-select"></select>
        </div>
        <canvas id="spectrum-canvas" class="chart-canvas"></canvas>
      </div>
      <div class="chart-half">
        <div class="section-head">
          <h2>Band Power</h2>
          <select id="bands-ch-select" class="ch-select"></select>
        </div>
        <canvas id="bands-canvas" class="chart-canvas"></canvas>
      </div>
    </section>
  `;
}

function renderMetaOnly(s: SignalSession): string {
  return `
    <section class="chart-section">
      <h2>Signal Summary</h2>
      <div class="meta-grid">
        <div class="meta-item"><span class="label">Samples</span><span>${s.sample_count ?? "N/A"}</span></div>
        <div class="meta-item"><span class="label">Duration</span><span>${s.duration_ms ? formatDuration(s.duration_ms / 1000) : "N/A"}</span></div>
        <div class="meta-item"><span class="label">Sample Rate</span><span>${s.sample_rate_hz} Hz</span></div>
      </div>
      ${s.sparkline ? `<p class="muted small">Sparkline preview available — full signal data not included.</p>` : ""}
    </section>
  `;
}

function renderHealth(session: ParsedSession): string {
  const sections: string[] = [];

  if (session.healthData && Object.keys(session.healthData).length) {
    const items = Object.entries(session.healthData)
      .map(
        ([k, v]) =>
          `<div class="meta-item"><span class="label">${esc(k)}</span><span>${esc(String(v))}</span></div>`,
      )
      .join("");
    sections.push(
      `<section class="chart-section"><h2>Health Data</h2><div class="meta-grid">${items}</div></section>`,
    );
  }

  if (session.environmentData && Object.keys(session.environmentData).length) {
    const items = Object.entries(session.environmentData)
      .map(
        ([k, v]) =>
          `<div class="meta-item"><span class="label">${esc(k)}</span><span>${esc(String(v))}</span></div>`,
      )
      .join("");
    sections.push(
      `<section class="chart-section"><h2>Environment</h2><div class="meta-grid">${items}</div></section>`,
    );
  }

  return sections.join("");
}

// ── Interactions ───────────────────────────────────────────────────────────

function setupInteractions(s: SignalSession): void {
  // Channel toggles
  const togglesEl = document.getElementById("ch-toggles")!;
  s.channels.forEach((ch, i) => {
    const btn = document.createElement("button");
    btn.className = "ch-toggle active";
    btn.textContent = ch.label;
    btn.style.borderColor = COLORS[i % COLORS.length];
    btn.addEventListener("click", () => {
      const idx = activeChannels.indexOf(i);
      if (idx >= 0) {
        activeChannels.splice(idx, 1);
        btn.classList.remove("active");
      } else {
        activeChannels.push(i);
        activeChannels.sort();
        btn.classList.add("active");
      }
      redrawWaveform(s);
    });
    togglesEl.appendChild(btn);
  });

  // Channel selects for spectrum + bands
  const specSelect = document.getElementById(
    "spectrum-ch-select",
  ) as HTMLSelectElement;
  const bandsSelect = document.getElementById(
    "bands-ch-select",
  ) as HTMLSelectElement;
  s.channels.forEach((ch, i) => {
    specSelect.add(new Option(ch.label, String(i)));
    bandsSelect.add(new Option(ch.label, String(i)));
  });
  specSelect.addEventListener("change", () => {
    selectedChannel = parseInt(specSelect.value);
    bandsSelect.value = specSelect.value;
    redrawAnalysis(s);
  });
  bandsSelect.addEventListener("change", () => {
    selectedChannel = parseInt(bandsSelect.value);
    specSelect.value = bandsSelect.value;
    redrawAnalysis(s);
  });

  // Time navigation
  const slider = document.getElementById("time-slider") as HTMLInputElement;
  const zoomSelect = document.getElementById(
    "zoom-select",
  ) as HTMLSelectElement;

  function updateTimeView(): void {
    const windowSec = viewEnd - viewStart;
    const sliderVal = parseFloat(slider.value);
    viewStart = (sliderVal / 100) * Math.max(0, totalDuration - windowSec);
    viewEnd = viewStart + windowSec;
    redrawWaveform(s);
  }

  slider.addEventListener("input", updateTimeView);

  zoomSelect.addEventListener("change", () => {
    const val = parseFloat(zoomSelect.value);
    const windowSec = val === 0 ? totalDuration : Math.min(val, totalDuration);
    const center = (viewStart + viewEnd) / 2;
    viewStart = Math.max(0, center - windowSec / 2);
    viewEnd = Math.min(totalDuration, viewStart + windowSec);
    if (viewEnd - viewStart < windowSec)
      viewStart = Math.max(0, viewEnd - windowSec);
    redrawWaveform(s);
  });

  document.getElementById("nav-left")!.addEventListener("click", () => {
    const windowSec = viewEnd - viewStart;
    const step = windowSec * 0.25;
    viewStart = Math.max(0, viewStart - step);
    viewEnd = viewStart + windowSec;
    slider.value = String(
      totalDuration > windowSec
        ? (viewStart / (totalDuration - windowSec)) * 100
        : 0,
    );
    redrawWaveform(s);
  });

  document.getElementById("nav-right")!.addEventListener("click", () => {
    const windowSec = viewEnd - viewStart;
    const step = windowSec * 0.25;
    viewEnd = Math.min(totalDuration, viewEnd + step);
    viewStart = viewEnd - windowSec;
    slider.value = String(
      totalDuration > windowSec
        ? (viewStart / (totalDuration - windowSec)) * 100
        : 0,
    );
    redrawWaveform(s);
  });

  // Resize observer
  const ro = new ResizeObserver(() => {
    redrawWaveform(s);
    redrawAnalysis(s);
  });
  document
    .querySelectorAll<HTMLCanvasElement>(".chart-canvas")
    .forEach((c) => ro.observe(c));

  // Initial draw
  redrawWaveform(s);
  redrawAnalysis(s);
}

function redrawWaveform(s: SignalSession): void {
  const canvas = document.getElementById(
    "waveform-canvas",
  ) as HTMLCanvasElement | null;
  if (canvas) drawWaveform(canvas, s, activeChannels, viewStart, viewEnd);
}

function redrawAnalysis(s: SignalSession): void {
  const specCanvas = document.getElementById(
    "spectrum-canvas",
  ) as HTMLCanvasElement | null;
  const bandsCanvas = document.getElementById(
    "bands-canvas",
  ) as HTMLCanvasElement | null;
  if (specCanvas) drawSpectrum(specCanvas, s, selectedChannel);
  if (bandsCanvas) drawBands(bandsCanvas, s, selectedChannel);
}

// ── Utilities ──────────────────────────────────────────────────────────────

const COLORS = [
  "#00E5FF",
  "#4ade80",
  "#a78bfa",
  "#facc15",
  "#f472b6",
  "#fb923c",
  "#34d399",
  "#818cf8",
];

function app(): HTMLElement {
  return document.getElementById("app")!;
}

function esc(s: string): string {
  const el = document.createElement("span");
  el.textContent = s;
  return el.innerHTML;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toFixed(0)}s`;
}

function timeUntil(date: Date): string {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3.6e6);
  if (hours < 1) return "< 1h";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
