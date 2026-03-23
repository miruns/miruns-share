import { fft, hanningWindow, nextPow2, psd } from "../fft";
import type { SignalSession } from "../types";
import { EEG_BANDS } from "../types";

/**
 * Draw frequency spectrum (averaged PSD across segmented windows) for a channel.
 * Enhanced with gradient fills and glow effects per EEG band.
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

  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, "#0f1114");
  bgGrad.addColorStop(1, "#111111");
  ctx.fillStyle = bgGrad;
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

  // Draw band backgrounds with labels
  const bandsArr = Object.entries(EEG_BANDS);
  for (const [name, band] of bandsArr) {
    const x0 = padLeft + (band.range[0] / maxFreqHz) * plotW;
    const x1 = padLeft + (Math.min(band.range[1], maxFreqHz) / maxFreqHz) * plotW;
    const grad = ctx.createLinearGradient(0, 8, 0, 8 + plotH);
    grad.addColorStop(0, band.color + "18");
    grad.addColorStop(1, band.color + "04");
    ctx.fillStyle = grad;
    ctx.fillRect(x0, 8, x1 - x0, plotH);

    // Band label at top
    ctx.fillStyle = band.color + "44";
    ctx.font = "9px 'Geist Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(name, (x0 + x1) / 2, 20);
    ctx.textAlign = "start";
  }

  // Build path points
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < maxBin; i++) {
    const x = padLeft + (i / maxBin) * plotW;
    const y = 8 + plotH - ((dbPsd[i] - minDb) / (maxDb - minDb)) * plotH;
    pts.push({ x, y });
  }

  // Fill under curve with gradient per band segment
  for (const [, band] of bandsArr) {
    const binLo = Math.max(0, Math.floor(band.range[0] / binWidth));
    const binHi = Math.min(maxBin - 1, Math.ceil(Math.min(band.range[1], maxFreqHz) / binWidth));
    if (binLo >= maxBin) continue;

    ctx.beginPath();
    for (let i = binLo; i <= binHi && i < pts.length; i++) {
      if (i === binLo) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    const lastIdx = Math.min(binHi, pts.length - 1);
    ctx.lineTo(pts[lastIdx].x, 8 + plotH);
    ctx.lineTo(pts[binLo].x, 8 + plotH);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, 8, 0, 8 + plotH);
    fillGrad.addColorStop(0, band.color + "30");
    fillGrad.addColorStop(1, band.color + "06");
    ctx.fillStyle = fillGrad;
    ctx.fill();
  }

  // Glow effect on spectrum line
  ctx.save();
  ctx.shadowColor = "#00E5FF";
  ctx.shadowBlur = 8;
  ctx.strokeStyle = "#00E5FF66";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
    else ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.stroke();
  ctx.restore();

  // Sharp spectrum line
  ctx.strokeStyle = "#00E5FF";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
    else ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.stroke();

  // Peak markers
  for (let i = 1; i < pts.length - 1; i++) {
    if (dbPsd[i] > dbPsd[i - 1] && dbPsd[i] > dbPsd[i + 1] && dbPsd[i] > minDb + (maxDb - minDb) * 0.5) {
      const freq = i * binWidth;
      // Find which band this belongs to
      let peakColor = "#00E5FF";
      for (const [, band] of bandsArr) {
        if (freq >= band.range[0] && freq < band.range[1]) {
          peakColor = band.color;
          break;
        }
      }
      ctx.save();
      ctx.shadowColor = peakColor;
      ctx.shadowBlur = 6;
      ctx.fillStyle = peakColor;
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#ffffffaa";
      ctx.font = "9px 'Geist Mono', ui-monospace, monospace";
      ctx.fillText(`${freq.toFixed(1)}Hz`, pts[i].x + 5, pts[i].y - 6);
    }
  }

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
