import { bandPower, fft, hanningWindow, nextPow2, psd } from "../fft";
import type { SignalSession } from "../types";
import { EEG_BANDS } from "../types";

/**
 * Draw horizontal bar chart showing EEG band power distribution for a channel.
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

  ctx.fillStyle = "#111111";
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

  const padLeft = 60;
  const padRight = 48;
  const padTop = 8;
  const barHeight = Math.min(28, (h - padTop - 8) / bands.length - 6);
  const maxBarW = w - padLeft - padRight;

  bands.forEach(([name, band], i) => {
    const y = padTop + i * (barHeight + 6);
    const barW = (percents[i] / 100) * maxBarW;

    // Bar background
    ctx.fillStyle = "#ffffff0a";
    ctx.beginPath();
    ctx.roundRect(padLeft, y, maxBarW, barHeight, 4);
    ctx.fill();

    // Bar fill
    ctx.fillStyle = band.color + "cc";
    ctx.beginPath();
    ctx.roundRect(padLeft, y, Math.max(barW, 2), barHeight, 4);
    ctx.fill();

    // Label
    ctx.fillStyle = "#EDEDED";
    ctx.font = "11px 'Geist Mono', ui-monospace, monospace";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 4, y + barHeight / 2);

    // Percentage
    ctx.fillStyle = "#888888";
    ctx.fillText(
      `${percents[i].toFixed(1)}%`,
      padLeft + maxBarW + 6,
      y + barHeight / 2,
    );
  });
}
