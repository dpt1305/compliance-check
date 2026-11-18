import sharp from 'sharp';
import { trace } from '@/lib/services/submission-log';

export interface ImageCrop {
  /** Human-readable description given to the AI so it knows what the crop shows. */
  label: string;
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png';
  /** 'contrast' = contrast-stretched tile, 'zoom' = original-colour enlarged tile. */
  kind: 'contrast' | 'zoom';
}

interface Strip {
  label: string;
  /** Fractions of the full image (0–1). Full height; the strips overlap so no text is cut at a seam. */
  left: number;
  width: number;
}

// Three full-height strips overlapping by ~30%: a label, a counter or a serial that sits on a seam of one strip
// is whole in a neighbouring one. Clocks (corners) fall inside the left/right strips.
const STRIPS: Strip[] = [
  { label: 'left part', left: 0, width: 0.55 },
  { label: 'middle part', left: 0.225, width: 0.55 },
  { label: 'right part', left: 0.45, width: 0.55 },
];

// Vision models downscale each image to roughly 768px on its short side, so a tile wider than ~1400px only adds
// upload time and bytes, not legibility. Keep tiles modest and JPEG-compressed (much smaller than PNG).
const MAX_OUT_WIDTH = 1600;
const CONTRAST_MIN_OUT_WIDTH = 1200;
const ZOOM_MIN_OUT_WIDTH = 1400;
const MIN_SOURCE_WIDTH = 400; // below this, cropping adds nothing

/**
 * Build two sets of three overlapping strips of the screenshot:
 *  - 'contrast': contrast-stretched (dark-mode screenshots have flat, low-contrast text)
 *  - 'zoom': original colours, enlarged so small text has more pixels
 * Returns [] (caller sends the full image only) if the image is tiny or processing fails.
 */
export async function buildImageCrops(imageBytes: Buffer): Promise<ImageCrop[]> {
  try {
    // Apply EXIF orientation first so fractions refer to what the user actually sees.
    const base = await sharp(imageBytes).rotate().toBuffer({ resolveWithObject: true });
    const { width, height } = base.info;
    if (!width || !height || width < MIN_SOURCE_WIDTH) return [];

    const make = (s: Strip, kind: ImageCrop['kind']) => async (): Promise<ImageCrop> => {
      const cropW = Math.max(1, Math.round(width * s.width));
      const left = Math.min(width - cropW, Math.round(width * s.left));
      const minOut = kind === 'contrast' ? CONTRAST_MIN_OUT_WIDTH : ZOOM_MIN_OUT_WIDTH;
      let pipeline = sharp(base.data)
        .extract({ left, top: 0, width: cropW, height })
        .resize({ width: Math.min(MAX_OUT_WIDTH, Math.max(minOut, cropW)), kernel: 'lanczos3' });
      if (kind === 'contrast') pipeline = pipeline.normalise();
      const bytes = await pipeline.sharpen().jpeg({ quality: 88 }).toBuffer();
      const what = kind === 'contrast' ? 'contrast-enhanced' : 'original colours, enlarged';
      return { label: `${s.label}, ${what}`, bytes, mimeType: 'image/jpeg', kind };
    };

    const jobs = [
      ...STRIPS.map(s => make(s, 'contrast')),
      ...STRIPS.map(s => make(s, 'zoom')),
    ];
    return await Promise.all(jobs.map(job => job()));
  } catch (err) {
    trace.warn('[image-crops] Failed to build crops, using full image only:', (err as Error).message);
    return [];
  }
}
