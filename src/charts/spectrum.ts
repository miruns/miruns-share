import { fft, hanningWindow, nextPow2, psd } from "../fft";
import type { SignalSession } from "../types";
import { EEG_BANDS } from "../types";

/**
 * Draw frequency spectrum (averaged PSD across segmented windows) for a channel.
 */
export function drawSpectrum(
  canvas: HTMLCanvasElement,
  signal: SignalSession,
  channelIdx: number,
  maxFreqHz = 60,
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
  const nfft = nextPow2(Math.min(signal.samples.length, 1024));
  const halfN = nfft >> 1;
  const binWidth = sr / nfft;
  const maxBin = Math.min(halfN, Math.ceil(maxFreqHz / binWidth));

  // Average PSD over overlapping windows
  const step = nfft >> 1; // 50% overlap
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

  // Convert to dB
  const dbPsd = new Float64Array(maxBin);
  let maxDb = -Infinity;
  for (let i = 0; i < maxBin; i++) {
    dbPsd[i] = 10 * Math.log10(avgPsd[i] + 1e-12);
    if (dbPsd[i] > maxDb) maxDb = dbPsd[i];
  }
  const minDb = maxDb - 60;

  const padLeft = 44;
  const padBottom = 28;
  const plotW = w - padLeft - 12;
  const plotH = h - padBottom - 12;

  // Draw band backgrounds
  for (const [, band] of Object.entries(EEG_BANDS)) {
    const x0 = padLeft + (band.range[0] / maxFreqHz) * plotW;
    const x1 = padLeft + (band.range[1] / maxFreqHz) * plotW;
    ctx.fillStyle = band.color + "12";
    ctx.fillRect(x0, 8, x1 - x0, plotH);
  }

  // Spectrum line
  ctx.strokeStyle = "#00E5FF";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < maxBin; i++) {
    const x = padLeft + (i / maxBin) * plotW;
    const y = 8 + plotH - ((dbPsd[i] - minDb) / (maxDb - minDb)) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Fill under curve
  const lastX = padLeft + ((maxBin - 1) / maxBin) * plotW;
  ctx.lineTo(lastX, 8 + plotH);
  ctx.lineTo(padLeft, 8 + plotH);
  ctx.closePath();
  ctx.fillStyle = "#00E5FF10";
  ctx.fill();

  // X-axis labels
  ctx.fillStyle = "#ffffff50";
  ctx.font = "10px 'Geist Mono', ui-monospace, monospace";
  const freqStep = maxFreqHz <= 30 ? 5 : 10;
  for (let f = 0; f <= maxFreqHz; f += freqStep) {
    const x = padLeft + (f / maxFreqHz) * plotW;
    ctx.fillText(`${f}`, x - 4, h - 4);
  }
  ctx.fillText("Hz", w - 20, h - 4);

  // Y-axis labels
  const dbStep = 20;
  for (let db = Math.ceil(minDb / dbStep) * dbStep; db <= maxDb; db += dbStep) {
    const y = 8 + plotH - ((db - minDb) / (maxDb - minDb)) * plotH;
    ctx.fillText(`${db.toFixed(0)}`, 4, y + 3);
    ctx.strokeStyle = "#ffffff08";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - 12, y);
    ctx.stroke();
  }
  ctx.fillText("dB", 4, 14);
}
