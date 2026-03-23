/** Cooley-Tukey radix-2 FFT — matches the Flutter app's FftEngine. */

export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // Butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < halfLen; k++) {
        const evenIdx = i + k;
        const oddIdx = i + k + halfLen;
        const tRe = curRe * re[oddIdx] - curIm * im[oddIdx];
        const tIm = curRe * im[oddIdx] + curIm * re[oddIdx];
        re[oddIdx] = re[evenIdx] - tRe;
        im[oddIdx] = im[evenIdx] - tIm;
        re[evenIdx] += tRe;
        im[evenIdx] += tIm;
        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }
}

/** Apply Hanning window in-place. */
export function hanningWindow(data: Float64Array): void {
  const n = data.length;
  for (let i = 0; i < n; i++) {
    data[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
}

/** Compute power spectral density (magnitude²) from FFT result. Returns N/2 bins. */
export function psd(re: Float64Array, im: Float64Array): Float64Array {
  const n = re.length;
  const half = n >> 1;
  const result = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    result[i] = (re[i] * re[i] + im[i] * im[i]) / (n * n);
  }
  return result;
}

/** Next power of 2 ≥ n. */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** Extract average power in a frequency band from PSD. */
export function bandPower(
  psdData: Float64Array,
  sampleRate: number,
  lowHz: number,
  highHz: number,
): number {
  const binWidth = sampleRate / (psdData.length * 2);
  const lo = Math.max(0, Math.floor(lowHz / binWidth));
  const hi = Math.min(psdData.length - 1, Math.ceil(highHz / binWidth));
  if (lo >= hi) return 0;
  let sum = 0;
  for (let i = lo; i <= hi; i++) sum += psdData[i];
  return sum / (hi - lo + 1);
}
