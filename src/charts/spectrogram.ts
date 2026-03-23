import { fft, hanningWindow, nextPow2, psd } from "../fft";
import type { EventMarker, SignalSession } from "../types";
import { EEG_BANDS } from "../types";

/**
 * Scientific colormap (Viridis-inspired) for spectrogram rendering.
 * Maps normalized value [0, 1] → [r, g, b] each in [0, 255].
 */
function viridis(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  // Simplified viridis stops
  const stops: [number, number, number, number][] = [
    [0.0, 13, 8, 35],
    [0.15, 46, 5, 105],
    [0.3, 72, 34, 116],
    [0.45, 94, 65, 112],
    [0.55, 115, 99, 99],
    [0.65, 140, 137, 72],
    [0.75, 176, 177, 44],
    [0.85, 220, 213, 36],
    [1.0, 253, 231, 37],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      const f =
        (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      return [
        Math.round(stops[i][1] + f * (stops[i + 1][1] - stops[i][1])),
        Math.round(stops[i][2] + f * (stops[i + 1][2] - stops[i][2])),
        Math.round(stops[i][3] + f * (stops[i + 1][3] - stops[i][3])),
      ];
    }
  }
  return [253, 231, 37];
}

/**
 * Draw a spectrogram (time-frequency heatmap) using STFT.
 * This is the gold-standard visualization in EEG/neuroscience.
 */
export function drawSpectrogram(
  canvas: HTMLCanvasElement,
  signal: SignalSession,
  channelIdx: number,
  maxFreqHz = 60,
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
  const halfN = windowSize >> 1;
  const binWidth = sr / windowSize;
  const maxBin = Math.min(halfN, Math.ceil(maxFreqHz / binWidth));
  const step = windowSize >> 2; // 75% overlap for smoother display

  // Compute STFT
  const columns: Float64Array[] = [];
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

    // Take only up to maxBin and convert to dB
    const col = new Float64Array(maxBin);
    for (let i = 0; i < maxBin; i++) {
      col[i] = 10 * Math.log10(p[i] + 1e-12);
    }
    columns.push(col);
  }

  if (columns.length === 0) return;

  // Find global min/max for normalization
  let globalMin = Infinity;
  let globalMax = -Infinity;
  for (const col of columns) {
    for (let i = 0; i < col.length; i++) {
      if (col[i] < globalMin) globalMin = col[i];
      if (col[i] > globalMax) globalMax = col[i];
    }
  }

  // Clamp dynamic range to 50 dB
  const dynRange = globalMax - globalMin;
  if (dynRange > 50) globalMin = globalMax - 50;

  const padLeft = 44;
  const padBottom = 28;
  const padTop = 8;
  const padRight = 60; // space for colorbar
  const plotW = w - padLeft - padRight;
  const plotH = h - padBottom - padTop;

  // Render spectrogram as pixel grid
  const imageData = ctx.createImageData(
    Math.ceil(plotW * dpr),
    Math.ceil(plotH * dpr),
  );
  const data = imageData.data;
  const imgW = imageData.width;
  const imgH = imageData.height;

  for (let px = 0; px < imgW; px++) {
    const colIdx = Math.floor((px / imgW) * columns.length);
    const col = columns[Math.min(colIdx, columns.length - 1)];
    for (let py = 0; py < imgH; py++) {
      // y=0 is top → high freq, y=imgH is bottom → low freq
      const binIdx = Math.floor(((imgH - 1 - py) / imgH) * maxBin);
      const val = col[Math.min(binIdx, col.length - 1)];
      const norm = (val - globalMin) / (globalMax - globalMin);
      const [r, g, b] = viridis(norm);
      const idx = (py * imgW + px) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  // Draw the image at plot area
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = imgW;
  tempCanvas.height = imgH;
  const tempCtx = tempCanvas.getContext("2d")!;
  tempCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(tempCanvas, padLeft, padTop, plotW, plotH);

  // Draw EEG band markers on Y-axis
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  for (const [, band] of Object.entries(EEG_BANDS)) {
    for (const freq of band.range) {
      if (freq <= maxFreqHz) {
        const y = padTop + plotH - (freq / maxFreqHz) * plotH;
        ctx.strokeStyle = band.color + "88";
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(padLeft + plotW, y);
        ctx.stroke();
      }
    }
  }
  ctx.setLineDash([]);

  // Y-axis labels (frequency)
  ctx.fillStyle = "#ffffff50";
  ctx.font = "10px 'Geist Mono', ui-monospace, monospace";
  const freqTicks = [0, 4, 8, 13, 30, 60].filter((f) => f <= maxFreqHz);
  for (const f of freqTicks) {
    const y = padTop + plotH - (f / maxFreqHz) * plotH;
    ctx.fillText(`${f}`, 4, y + 3);
  }
  ctx.fillText("Hz", 4, padTop - 1);

  // X-axis labels (time)
  const totalSamples = signal.samples.length;
  const totalTimeSec = (totalSamples - 1) / sr;
  const timeStep =
    totalTimeSec <= 10 ? 1 : totalTimeSec <= 30 ? 5 : totalTimeSec <= 120 ? 10 : 30;
  for (
    let t = 0;
    t <= totalTimeSec;
    t += timeStep
  ) {
    const x = padLeft + (t / totalTimeSec) * plotW;
    ctx.fillText(`${t.toFixed(0)}s`, x - 4, h - 4);
  }

  // Color bar
  const cbX = w - padRight + 14;
  const cbW = 12;
  const cbH = plotH;
  for (let py = 0; py < cbH; py++) {
    const norm = 1 - py / cbH;
    const [r, g, b] = viridis(norm);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(cbX, padTop + py, cbW, 1);
  }
  ctx.strokeStyle = "#ffffff20";
  ctx.lineWidth = 1;
  ctx.strokeRect(cbX, padTop, cbW, cbH);

  // Colorbar labels
  ctx.fillStyle = "#ffffff50";
  ctx.fillText(`${globalMax.toFixed(0)}`, cbX + cbW + 4, padTop + 8);
  ctx.fillText(`${globalMin.toFixed(0)}`, cbX + cbW + 4, padTop + cbH);
  ctx.fillText("dB", cbX + cbW + 4, padTop + cbH / 2 + 3);

  // Event markers
  if (markers?.length) {
    const totalTimeSec2 = (totalSamples - 1) / sr;
    for (const m of markers) {
      const markerSec = m.sampleIdx / sr;
      if (markerSec < 0 || markerSec > totalTimeSec2) continue;
      const x = padLeft + (markerSec / totalTimeSec2) * plotW;
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
