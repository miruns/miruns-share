import { bandPower, fft, hanningWindow, nextPow2, psd } from "../fft";
import type { SignalSession } from "../types";
import { EEG_BANDS } from "../types";

/**
 * Draw a radar (spider) chart of EEG band powers.
 * Each axis represents a frequency band; the filled polygon shows relative power.
 */
export function drawRadar(
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

  // Compute averaged PSD
  const step = nfft >> 1;
  const avgPsd = new Float64Array(halfN);
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
  const numBands = bands.length;
  const powers: number[] = [];
  let maxPower = 0;

  for (const [, band] of bands) {
    const bp = bandPower(avgPsd, sr, band.range[0], band.range[1]);
    powers.push(bp);
    if (bp > maxPower) maxPower = bp;
  }

  if (maxPower === 0) return;

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 40;
  const angleStep = (2 * Math.PI) / numBands;
  const startAngle = -Math.PI / 2; // start from top

  // Draw concentric grid circles
  const gridLevels = 4;
  for (let level = 1; level <= gridLevels; level++) {
    const r = (level / gridLevels) * radius;
    ctx.strokeStyle = "#ffffff08";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Percentage label
    ctx.fillStyle = "#ffffff20";
    ctx.font = "9px 'Geist Mono', ui-monospace, monospace";
    ctx.fillText(
      `${Math.round((level / gridLevels) * 100)}%`,
      cx + 3,
      cy - r + 10,
    );
  }

  // Draw axis lines and labels
  bands.forEach(([, band], i) => {
    const angle = startAngle + i * angleStep;
    const ax = cx + Math.cos(angle) * radius;
    const ay = cy + Math.sin(angle) * radius;

    ctx.strokeStyle = "#ffffff10";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ax, ay);
    ctx.stroke();

    // Band label
    const labelR = radius + 18;
    const lx = cx + Math.cos(angle) * labelR;
    const ly = cy + Math.sin(angle) * labelR;
    ctx.fillStyle = band.color;
    ctx.font = "bold 11px 'Geist Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(band.label.split(" ")[0], lx, ly);

    // Greek letter
    const greekR = radius + 30;
    const gx = cx + Math.cos(angle) * greekR;
    const gy = cy + Math.sin(angle) * greekR;
    ctx.fillStyle = band.color + "88";
    ctx.font = "10px 'Geist', system-ui, sans-serif";
    ctx.fillText(band.label.match(/\((.+)\)/)?.[1] ?? "", gx, gy);
  });

  // Draw filled polygon with gradient
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, "rgba(0, 229, 255, 0.35)");
  gradient.addColorStop(1, "rgba(157, 80, 187, 0.15)");

  ctx.beginPath();
  bands.forEach(([, _band], i) => {
    const angle = startAngle + i * angleStep;
    const normalizedPower = powers[i] / maxPower;
    const r = normalizedPower * radius;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Polygon outline with glow
  ctx.shadowColor = "#00E5FF";
  ctx.shadowBlur = 12;
  ctx.strokeStyle = "#00E5FF";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Draw data points with glow
  bands.forEach(([, band], i) => {
    const angle = startAngle + i * angleStep;
    const normalizedPower = powers[i] / maxPower;
    const r = normalizedPower * radius;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;

    ctx.shadowColor = band.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = band.color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Value label
    const totalPower = powers.reduce((a, b) => a + b, 0);
    const pct = totalPower > 0 ? ((powers[i] / totalPower) * 100).toFixed(1) : "0";
    ctx.fillStyle = "#ffffff80";
    ctx.font = "10px 'Geist Mono', ui-monospace, monospace";
    const valAngle = angle;
    const valR = r + 14;
    ctx.fillText(
      `${pct}%`,
      cx + Math.cos(valAngle) * valR - 10,
      cy + Math.sin(valAngle) * valR,
    );
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}
