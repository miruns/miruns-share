import { bandPower, fft, hanningWindow, nextPow2, psd } from "../fft";
import type { SignalSession } from "../types";
import { EEG_BANDS } from "../types";

/**
 * Draw horizontal bar chart showing EEG band power distribution for a channel.
 * Enhanced with gradient bars and glow effects.
 */
export function drawBands(
  canvas: HTMLCanvasElement,
  signal: SignalSession,
  channelIdx: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, "#0f1114");
  bgGrad.addColorStop(1, "#111111");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  if (signal.samples.length < 64) return;

  const sr = signal.sample_rate_hz;
  const nfft = nextPow2(Math.min(signal.samples.length, 1024));
  const halfN = nfft >> 1;

  // Average PSD over overlapping windows
  const step = nfft >> 1;
  let avgPsd = new Float64Array(halfN);
  let windowCount = 0;

  for (let start = 0; start + nfft <= signal.samples.length; start += step) {
    const re = new Float64Array(nfft);
    const im = new Float64Array(nfft);
    for (let i = 0; i < nfft; i++) {
      re[i] = signal.samples[start + i].ch[channelIdx] ?? 0;
    }
    hanningWindow(re);
    fft(re, im);
    const p = psd(re, im);
    for (let i = 0; i < halfN; i++) avgPsd[i] += p[i];
    windowCount++;
  }

  if (windowCount === 0) return;
  for (let i = 0; i < halfN; i++) avgPsd[i] /= windowCount;

  // Compute band powers
  const bands = Object.entries(EEG_BANDS);
  const powers: number[] = [];
  let totalPower = 0;
  for (const [, band] of bands) {
    const bp = bandPower(avgPsd, sr, band.range[0], band.range[1]);
    powers.push(bp);
    totalPower += bp;
  }

  // Compute relative %
  const percents = powers.map((p) =>
    totalPower > 0 ? (p / totalPower) * 100 : 0,
  );

  const padLeft = 64;
  const padRight = 56;
  const padTop = 12;
  const barHeight = Math.min(32, (h - padTop - 12) / bands.length - 8);
  const maxBarW = w - padLeft - padRight;

  // Find dominant band
  let maxIdx = 0;
  for (let i = 1; i < percents.length; i++) {
    if (percents[i] > percents[maxIdx]) maxIdx = i;
  }

  bands.forEach(([name, band], i) => {
    const y = padTop + i * (barHeight + 8);
    const barW = (percents[i] / 100) * maxBarW;

    // Bar background with subtle border
    ctx.fillStyle = "#ffffff06";
    ctx.beginPath();
    ctx.roundRect(padLeft, y, maxBarW, barHeight, 6);
    ctx.fill();
    ctx.strokeStyle = "#ffffff08";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.roundRect(padLeft, y, maxBarW, barHeight, 6);
    ctx.stroke();

    // Bar fill with gradient
    const barGrad = ctx.createLinearGradient(padLeft, 0, padLeft + barW, 0);
    barGrad.addColorStop(0, band.color + "dd");
    barGrad.addColorStop(1, band.color + "88");
    ctx.fillStyle = barGrad;
    ctx.beginPath();
    ctx.roundRect(padLeft, y, Math.max(barW, 2), barHeight, 6);
    ctx.fill();

    // Glow on dominant band
    if (i === maxIdx) {
      ctx.save();
      ctx.shadowColor = band.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = band.color + "44";
      ctx.beginPath();
      ctx.roundRect(padLeft, y, Math.max(barW, 2), barHeight, 6);
      ctx.fill();
      ctx.restore();
    }

    // Band label (full name with Greek letter)
    ctx.fillStyle = i === maxIdx ? "#EDEDED" : "#bbbbbb";
    ctx.font = i === maxIdx
      ? "bold 11px 'Geist Mono', ui-monospace, monospace"
      : "11px 'Geist Mono', ui-monospace, monospace";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 4, y + barHeight / 2);

    // Frequency range
    ctx.fillStyle = "#ffffff25";
    ctx.font = "8px 'Geist Mono', ui-monospace, monospace";
    ctx.fillText(
      `${band.range[0]}–${band.range[1]}Hz`,
      4,
      y + barHeight / 2 + 12,
    );

    // Percentage with glow for dominant
    if (i === maxIdx) {
      ctx.fillStyle = band.color;
      ctx.font = "bold 12px 'Geist Mono', ui-monospace, monospace";
    } else {
      ctx.fillStyle = "#999999";
      ctx.font = "11px 'Geist Mono', ui-monospace, monospace";
    }
    ctx.fillText(
      `${percents[i].toFixed(1)}%`,
      padLeft + maxBarW + 6,
      y + barHeight / 2,
    );
  });

  ctx.textBaseline = "alphabetic";
}
