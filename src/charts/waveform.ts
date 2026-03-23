import type { SignalSession } from "../types";

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

/**
 * Render multi-channel waveform to a <canvas>.
 * Supports a visible time window [startSec, endSec].
 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  signal: SignalSession,
  channels: number[],
  startSec: number,
  endSec: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, w, h);

  if (!signal.samples.length || !channels.length) return;

  const firstT = signal.samples[0].t;
  const startUs = firstT + startSec * 1e6;
  const endUs = firstT + endSec * 1e6;

  // Find sample range
  let iStart = 0;
  let iEnd = signal.samples.length - 1;
  for (let i = 0; i < signal.samples.length; i++) {
    if (signal.samples[i].t >= startUs) {
      iStart = i;
      break;
    }
  }
  for (let i = signal.samples.length - 1; i >= 0; i--) {
    if (signal.samples[i].t <= endUs) {
      iEnd = i;
      break;
    }
  }

  const visibleSamples = signal.samples.slice(iStart, iEnd + 1);
  if (visibleSamples.length < 2) return;

  const laneH = h / channels.length;
  const margin = 4;

  channels.forEach((chIdx, lane) => {
    const yCenter = lane * laneH + laneH / 2;
    const drawH = laneH - margin * 2;

    // Auto-scale per channel
    let min = Infinity,
      max = -Infinity;
    for (const s of visibleSamples) {
      const v = s.ch[chIdx] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;

    // Channel label
    ctx.fillStyle = COLORS[chIdx % COLORS.length] + "88";
    ctx.font = "11px 'Geist Mono', ui-monospace, monospace";
    ctx.fillText(
      signal.channels[chIdx]?.label ?? `Ch ${chIdx + 1}`,
      6,
      lane * laneH + 16,
    );

    // Lane separator
    if (lane > 0) {
      ctx.strokeStyle = "#ffffff10";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, lane * laneH);
      ctx.lineTo(w, lane * laneH);
      ctx.stroke();
    }

    // Waveform path
    ctx.strokeStyle = COLORS[chIdx % COLORS.length];
    ctx.lineWidth = 1.2;
    ctx.beginPath();

    const tRange =
      visibleSamples[visibleSamples.length - 1].t - visibleSamples[0].t;
    for (let i = 0; i < visibleSamples.length; i++) {
      const s = visibleSamples[i];
      const x = ((s.t - visibleSamples[0].t) / tRange) * w;
      const v = s.ch[chIdx] ?? 0;
      const y = yCenter - ((v - (min + max) / 2) / range) * drawH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  // Time axis ticks
  const totalSec = endSec - startSec;
  const tickInterval =
    totalSec <= 2 ? 0.5 : totalSec <= 10 ? 1 : totalSec <= 30 ? 5 : 10;
  ctx.fillStyle = "#ffffff40";
  ctx.font = "10px 'Geist Mono', ui-monospace, monospace";
  ctx.strokeStyle = "#ffffff10";
  ctx.lineWidth = 1;

  for (
    let t = Math.ceil(startSec / tickInterval) * tickInterval;
    t <= endSec;
    t += tickInterval
  ) {
    const x = ((t - startSec) / totalSec) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.fillText(`${t.toFixed(1)}s`, x + 3, h - 4);
  }
}
