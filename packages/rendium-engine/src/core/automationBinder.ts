import type { Segment } from '../_contracts/engine.contracts';

export interface AutomationValues {
  shakeIntensity: number;
  spectrumSensitivity: number;
  colorHueShift: number;
}

/**
 * Evaluates active segments at the current playback time and computes blended automation values.
 * Applies a linear ease-in/ease-out transition (ramp) of up to 0.2 seconds.
 */
export function getAutomationValues(
  segments: Segment[] | undefined,
  currentTime: number,
): AutomationValues {
  let accumulatedShakeIntensity = 0;
  let accumulatedSpectrumSensitivitySum = 0;
  let accumulatedColorHueShift = 0;

  if (segments && segments.length > 0) {
    for (const segment of segments) {
      if (currentTime >= segment.start && currentTime <= segment.end) {
        const duration = segment.end - segment.start;
        if (duration <= 0) continue;

        const fadeTime = Math.min(0.2, duration / 2);
        let weight = 1.0;

        if (currentTime < segment.start + fadeTime) {
          weight = (currentTime - segment.start) / fadeTime;
        } else if (currentTime > segment.end - fadeTime) {
          weight = (segment.end - currentTime) / fadeTime;
        }

        // Clamp weight to [0, 1] just in case
        weight = Math.max(0.0, Math.min(1.0, weight));

        if (segment.effects) {
          const shake = segment.effects.shakeIntensity ?? 0;
          const spectrum = segment.effects.spectrumSensitivity ?? 1.0;
          const hue = segment.effects.colorHueShift ?? 0;

          accumulatedShakeIntensity += shake * weight;
          accumulatedSpectrumSensitivitySum += (spectrum - 1.0) * weight;
          accumulatedColorHueShift += hue * weight;
        }
      }
    }
  }

  return {
    shakeIntensity: accumulatedShakeIntensity,
    spectrumSensitivity: 1.0 + accumulatedSpectrumSensitivitySum,
    colorHueShift: accumulatedColorHueShift,
  };
}
