export interface CoverColors { glow: string; middle: string; edge: string }
export const defaultCoverColors: CoverColors = { glow: "#eee6df", middle: "#f6f3ef", edge: "#f8f9fb" };

export function colorsFromPixels(pixels: Uint8ClampedArray): CoverColors {
  const buckets = new Map<number, { weight: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    if (a < 128) continue;
    // Near-white/black areas often belong to borders or lettering. Prefer the
    // artwork's mid-tones, but fall back gracefully for monochrome covers.
    const brightness = (r + g + b) / 3;
    const weight = a / 255 * (brightness > 245 || brightness < 12 ? .08 : 1);
    const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
    const bucket = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 };
    bucket.weight += weight; bucket.r += r * weight; bucket.g += g * weight; bucket.b += b * weight;
    buckets.set(key, bucket);
  }
  const dominant = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
  if (!dominant) return { ...defaultCoverColors };
  const rgb = [dominant.r, dominant.g, dominant.b].map(value => value / dominant.weight);
  const tint = (white: number) => `rgb(${rgb.map(value => Math.round(value * (1 - white) + 255 * white)).join(", ")})`;
  return { glow: tint(.76), middle: tint(.89), edge: tint(.97) };
}

export async function readCoverColors(cover: string): Promise<CoverColors> {
  const url = new URL(cover);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported cover');
  url.searchParams.set('param', '64y64');
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { image.onload = image.onerror = null; image.src = ''; reject(new Error('Cover timeout')); }, 8000);
    image.onerror = () => { clearTimeout(timer); reject(new Error('Cover unavailable')); };
    image.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Canvas unavailable');
        context.drawImage(image, 0, 0, 32, 32);
        resolve(colorsFromPixels(context.getImageData(0, 0, 32, 32).data));
      } catch (reason) { reject(reason); }
    };
    image.src = url.href;
  });
}
