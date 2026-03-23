import { bandPower, fft, hanningWindow, nextPow2, psd } from "../fft";
import type { EventMarker, SignalSession } from "../types";
import { EEG_BANDS } from "../types";

/**
 * Draw a stacked area chart of EEG band power evolution over time.
 * Uses a sliding-window STFT to compute band powers at each time step.
 */
export function drawTimeline(
  canvas: HTMLCanvasElement,
  signal: SignalSession,
  channelIdx: number,
  markers?: EventMarker[],
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

  if (signal.samples.length < 64) return;

  const sr = signal.sample_rate_hz;
  const windowSize = nextPow2(Math.min(256, signal.samples.length));
  const step = windowSize >> 1; // 50% overlap

  const bands = Object.entries(EEG_BANDS);
  const timePoints: { timeSec: number; bandPowers: number[] }[] = [];

  // Compute band powers over time windows
  for (
    let start = 0;
    start + windowSize <= signal.samples.length;
    start += step
  ) {
    const re = new Float64Array(windowSize);
    const im = new Float64Array(windowSize);
    for (let i = 0; i < windowSize; i++) {
      re[i] = signal.samples[start + i].ch[channelIdx] ?? 0;
    }
    hanningWindow(re);
    fft(re, im);
    const p = psd(re, im);

    const bp: number[] = [];
    for (const [, band] of bands) {
      bp.push(bandPower(p, sr, band.range[0], band.range[1]));
    }

    const centerSample = start + windowSize / 2;
    const timeSec = centerSample / sr;
    timePoints.push({ timeSec, bandPowers: bp });
  }

  if (timePoints.length < 2) return;

  // Normalize each time point to sum=1 for stacked area
  const normalized = timePoints.map((tp) => {
    const total = tp.bandPowers.reduce((a, b) => a + b, 0);
    return {
      timeSec: tp.timeSec,
      fractions: total > 0 ? tp.bandPowers.map((p) => p / total) : tp.bandPowers.map(() => 0),
    };
  });

  const padLeft = 44;
  const padBottom = 28;
  const padRight = 12;
  const padTop = 12;
  const plotW = w - padLeft - padRight;
  const plotH = h - padBottom - padTop;
  const tMin = normalized[0].timeSec;
  const tMax = normalized[normalized.length - 1].timeSec;
  const tRange = tMax - tMin || 1;

  // Draw stacked areas (bottom to top)
  for (let bIdx = bands.length - 1; bIdx >= 0; bIdx--) {
    const [, band] = bands[bIdx];

    ctx.beginPath();

    // Top edge of this band's area
    for (let i = 0; i < normalized.length; i++) {
      const x = padLeft + ((normalized[i].timeSec - tMin) / tRange) * plotW;
      let yFraction = 0;
      for (let j = 0; j <= bIdx; j++) {
        yFraction += normalized[i].fractions[j];
      }
      const y = padTop + plotH - yFraction * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    // Bottom edge (previous band's top, or baseline)
    for (let i = normalized.length - 1; i >= 0; i--) {
      const x = padLeft + ((normalized[i].timeSec - tMin) / tRange) * plotW;
      let yFraction = 0;
      for (let j = 0; j < bIdx; j++) {
        yFraction += normalized[i].fractions[j];
      }
      const y = padTop + plotH - yFraction * plotH;
      ctx.lineTo(x, y);
    }

    ctx.closePath();

    // Gradient fill
    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    grad.addColorStop(0, band.color + "cc");
    grad.addColorStop(1, band.color + "44");
    ctx.fillStyle = grad;
    ctx.fill();

    // Subtle stroke on top edge
    ctx.beginPath();
    for (let i = 0; i < normalized.length; i++) {
      const x = padLeft + ((normalized[i].timeSec - tMin) / tRange) * plotW;
      let yFraction = 0;
      for (let j = 0; j <= bIdx; j++) {
        yFraction += normalized[i].fractions[j];
      }
      const y = padTop + plotH - yFraction * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = band.color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Y-axis
  ctx.fillStyle = "#ffffff40";
  ctx.font = "10px 'Geist Mono', ui-monospace, monospace";
  for (let pct = 0; pct <= 100; pct += 25) {
    const y = padTop + plotH - (pct / 100) * plotH;
    ctx.fillText(`${pct}%`, 4, y + 3);
    ctx.strokeStyle = "#ffffff08";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();
  }

  // X-axis (time)
  const totalTimeSec = tMax;
  const timeStep =
    totalTimeSec <= 10
      ? 1
      : totalTimeSec <= 30
        ? 5
        : totalTimeSec <= 120
          ? 10
          : 30;
  for (let t = 0; t <= totalTimeSec; t += timeStep) {
    const x = padLeft + ((t - tMin) / tRange) * plotW;
    if (x >= padLeft && x <= padLeft + plotW) {
      ctx.fillStyle = "#ffffff40";
      ctx.fillText(`${t.toFixed(0)}s`, x - 4, h - 4);
    }
  }

  // Inline legend (right side, vertically centered)
  const legendX = padLeft + plotW - 70;
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < bands.length; i++) {
    const [name, band] = bands[i];
    const ly = padTop + 14 + i * 16;
    ctx.fillStyle = band.color;
    ctx.fillRect(legendX, ly - 5, 8, 8);
    ctx.fillStyle = "#ffffffaa";
    ctx.font = "10px 'Geist Mono', ui-monospace, monospace";
    ctx.fillText(name, legendX + 12, ly + 3);
  }
  ctx.globalAlpha = 1;

  // Event markers
  if (markers?.length) {
    const sr = signal.sample_rate_hz;
    for (const m of markers) {
      const markerSec = m.sampleIdx / sr;
      if (markerSec < tMin || markerSec > tMax) continue;
      const x = padLeft + ((markerSec - tMin) / tRange) * plotW;
      const color = m.kind === "trigger" ? "#facc15" : "#f472b6";

      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = color + "aa";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Label at top
      ctx.font = "9px 'Geist Mono', ui-monospace, monospace";
      const labelW = ctx.measureText(m.label).width;
      const px = Math.max(padLeft, Math.min(x - labelW / 2 - 5, padLeft + plotW - labelW - 12));
      ctx.fillStyle = "#111111dd";
      ctx.strokeStyle = color + "88";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(px, padTop - 14, labelW + 10, 13, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(m.label, px + 5, padTop - 4);
    }
  }
}
