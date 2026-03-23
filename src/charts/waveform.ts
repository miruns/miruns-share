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
 * Render multi-channel waveform to a <canvas> with glow effects.
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

  // Dark background with subtle gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, "#0f1114");
  bgGrad.addColorStop(1, "#111111");
  ctx.fillStyle = bgGrad;
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

  // Time axis ticks (draw first, behind waveforms)
  const totalSec = endSec - startSec;
  const tickInterval =
    totalSec <= 2 ? 0.5 : totalSec <= 10 ? 1 : totalSec <= 30 ? 5 : 10;

  ctx.strokeStyle = "#ffffff08";
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
  }

  const laneH = h / channels.length;
  const margin = 6;

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

    // Zero line
    ctx.strokeStyle = "#ffffff06";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, yCenter);
    ctx.lineTo(w, yCenter);
    ctx.stroke();

    // Lane separator
    if (lane > 0) {
      ctx.strokeStyle = "#ffffff0c";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, lane * laneH);
      ctx.lineTo(w, lane * laneH);
      ctx.stroke();
    }

    const color = COLORS[chIdx % COLORS.length];
    const tRange =
      visibleSamples[visibleSamples.length - 1].t - visibleSamples[0].t;

    // Build the path points
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < visibleSamples.length; i++) {
      const s = visibleSamples[i];
      const x = ((s.t - visibleSamples[0].t) / tRange) * w;
      const v = s.ch[chIdx] ?? 0;
      const y = yCenter - ((v - (min + max) / 2) / range) * drawH;
      pts.push({ x, y });
    }

    // Soft glow under curve (gradient fill from line to center)
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.lineTo(pts[pts.length - 1].x, yCenter);
    ctx.lineTo(pts[0].x, yCenter);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, yCenter - drawH / 2, 0, yCenter + drawH / 2);
    fillGrad.addColorStop(0, color + "18");
    fillGrad.addColorStop(0.5, color + "04");
    fillGrad.addColorStop(1, color + "18");
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Glow layer (wider, blurred stroke)
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = color + "44";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.restore();

    // Sharp waveform line on top
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // Channel label with background pill
    const label = signal.channels[chIdx]?.label ?? `Ch ${chIdx + 1}`;
    ctx.font = "11px 'Geist Mono', ui-monospace, monospace";
    const labelW = ctx.measureText(label).width;
    ctx.fillStyle = "#111111cc";
    ctx.beginPath();
    ctx.roundRect(4, lane * laneH + 5, labelW + 12, 18, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(label, 10, lane * laneH + 18);

    // Scale indicator (µV range)
    const unit = signal.channels[chIdx]?.unit ?? "µV";
    const scaleLabel = `${range.toFixed(1)} ${unit}`;
    ctx.fillStyle = "#ffffff30";
    ctx.font = "9px 'Geist Mono', ui-monospace, monospace";
    ctx.fillText(scaleLabel, 10, lane * laneH + 32);
  });

  // Time axis labels (on top)
  ctx.fillStyle = "#ffffff40";
  ctx.font = "10px 'Geist Mono', ui-monospace, monospace";
  for (
    let t = Math.ceil(startSec / tickInterval) * tickInterval;
    t <= endSec;
    t += tickInterval
  ) {
    const x = ((t - startSec) / totalSec) * w;
    ctx.fillText(`${t.toFixed(1)}s`, x + 3, h - 4);
  }
}
