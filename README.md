# miruns share

Lightweight EEG session viewer for shared Miruns sessions. Paste a share link to visualize waveforms, frequency spectrum, and band power — all client-side.

<img width="1151" height="960" alt="image" src="https://github.com/user-attachments/assets/8a91dfae-0159-42ba-afca-59831f8a8dfa" />


## Features

- **Waveform** — multi-channel EEG with pan, zoom, and per-channel toggles
- **Spectrum** — averaged PSD (Welch method) with EEG band overlays
- **Band Power** — relative delta/theta/alpha/beta/gamma breakdown
- **Health & Environment** — heart rate, HRV, and contextual data when available
- **Zero dependencies** — vanilla TypeScript, canvas rendering, no chart libraries

## Stack

- TypeScript + Vite
- Custom Cooley-Tukey FFT (matches the Flutter app's `FftEngine`)
- Hosted on Vercel, API served by [miruns-link](https://github.com/miruns/miruns-link)

## Development

```bash
npm install
npm run dev
```

## How it works

1. User shares a session from the Miruns app → generates a short code via miruns-link
2. `miruns-share` fetches the session JSON by code
3. Signal data is parsed and rendered to `<canvas>` elements client-side
4. FFT and PSD are computed in the browser — no server-side processing

## Brand

Design follows the [miruns-brand](https://github.com/miruns/miruns-brand) system: Geist typeface, `#0A0A0A` dark background, `#00E5FF` cyan accent, pill-shaped controls, and the M signal mark.
