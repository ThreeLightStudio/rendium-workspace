type RgbaColor = [number, number, number, number];

export function rgbaToHex(rgb: RgbaColor) {
  const r = Math.round(rgb[0] * 255)
    .toString(16)
    .padStart(2, '0');
  const g = Math.round(rgb[1] * 255)
    .toString(16)
    .padStart(2, '0');
  const b = Math.round(rgb[2] * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function hexToRgba(hex: string, alpha = 1): RgbaColor {
  const cleanHex = hex.replace('#', '');
  const r = Number.parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = Number.parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = Number.parseInt(cleanHex.substring(4, 6), 16) / 255;
  return [r, g, b, alpha];
}
