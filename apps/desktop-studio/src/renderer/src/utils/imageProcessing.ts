/**
 * Resizes an image to multiple sizes while maintaining aspect ratio or padding.
 */

export interface ResizeOptions {
  width: number;
  height: number;
  fit?: 'contain' | 'cover';
}

/**
 * Resizes a Blob or File to a specific size using Canvas.
 * Returns a Blob of the specified format.
 */
export async function resizeImage(
  source: Blob | File | string,
  options: ResizeOptions,
  format = 'image/png',
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = options.width;
      canvas.height = options.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Clear with transparency
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const srcAspect = img.width / img.height;
      const dstAspect = options.width / options.height;

      let drawWidth = options.width;
      let drawHeight = options.height;
      let offsetX = 0;
      let offsetY = 0;

      if (options.fit === 'contain') {
        if (srcAspect > dstAspect) {
          drawHeight = options.width / srcAspect;
          offsetY = (options.height - drawHeight) / 2;
        } else {
          drawWidth = options.height * srcAspect;
          offsetX = (options.width - drawWidth) / 2;
        }
      }

      // Use high quality interpolation
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        },
        format,
        1.0,
      );
    };
    img.onerror = reject;

    if (typeof source === 'string') {
      img.src = source;
    } else {
      img.src = URL.createObjectURL(source);
    }
  });
}

/**
 * Convenience for multiple sizes
 */
export async function generateIconSizes(
  source: Blob | File,
  sizes: number[],
): Promise<Map<number, Blob>> {
  const result = new Map<number, Blob>();
  for (const size of sizes) {
    const blob = await resizeImage(source, {
      width: size,
      height: size,
      fit: 'contain',
    });
    result.set(size, blob);
  }
  return result;
}
