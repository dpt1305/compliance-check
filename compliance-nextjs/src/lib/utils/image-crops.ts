import sharp from 'sharp';

export interface ImageCrop {
  /** Human-readable description given to the AI so it knows what the crop shows. */
  label: string;
  bytes: Buffer;
  mimeType: 'image/jpeg';
}

interface Region {
  label: string;
  /** Fractions of the full image (0–1). */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Minimum output width after upscaling, so small text becomes legible. */
  minOutWidth: number;
}

// Where a clock/timestamp or small text usually lives:
//  - Windows: taskbar clock bottom-right.  - macOS: menu-bar clock top-right.
//  - Dialogs / terminal output: the central content area.
const REGIONS: Region[] = [
  { label: 'top-right corner (menu bar / clock area), zoomed', left: 0.6, top: 0, width: 0.4, height: 0.14, minOutWidth: 1400 },
  { label: 'bottom-right corner (taskbar / clock area), zoomed', left: 0.6, top: 0.86, width: 0.4, height: 0.14, minOutWidth: 1400 },
  { label: 'central content area (dialogs / terminal text), zoomed', left: 0.1, top: 0.1, width: 0.8, height: 0.8, minOutWidth: 2000 },
];

const MAX_OUT_WIDTH = 2400;
const MIN_SOURCE_WIDTH = 400; // below this, cropping adds nothing

/**
 * Build zoomed, sharpened crops of the regions where small text / timestamps usually are.
 * Returns [] (caller sends the full image only) if the image is tiny or processing fails.
 */
export async function buildImageCrops(imageBytes: Buffer): Promise<ImageCrop[]> {
  try {
    // Apply EXIF orientation first so fractions refer to what the user actually sees.
    const base = await sharp(imageBytes).rotate().toBuffer({ resolveWithObject: true });
    const { width, height } = base.info;
    if (!width || !height || width < MIN_SOURCE_WIDTH) return [];

    const crops = await Promise.all(
      REGIONS.map(async (r): Promise<ImageCrop> => {
        const cropW = Math.max(1, Math.round(width * r.width));
        const cropH = Math.max(1, Math.round(height * r.height));
        const outW = Math.min(MAX_OUT_WIDTH, Math.max(r.minOutWidth, cropW));
        const bytes = await sharp(base.data)
          .extract({
            left: Math.min(width - cropW, Math.round(width * r.left)),
            top: Math.min(height - cropH, Math.round(height * r.top)),
            width: cropW,
            height: cropH,
          })
          .resize({ width: outW, kernel: 'lanczos3' })
          .sharpen()
          .jpeg({ quality: 90 })
          .toBuffer();
        return { label: r.label, bytes, mimeType: 'image/jpeg' };
      }),
    );
    return crops;
  } catch (err) {
    console.warn('[image-crops] Failed to build crops, using full image only:', (err as Error).message);
    return [];
  }
}
