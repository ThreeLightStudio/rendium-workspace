/**
 * Read the duration of an audio file from a source URL.
 *
 * The caller is responsible for creating and managing the URL lifecycle.
 * This helper only inspects metadata and returns null when duration cannot
 * be resolved safely.
 */
export async function readAudioDurationFromUrl(sourceUrl: string): Promise<number | null> {
  if (typeof Audio === 'undefined') return null;

  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;

    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleError);
    };

    const finish = (duration: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(duration);
    };

    const handleLoadedMetadata = () => {
      const duration = audio.duration;
      if (Number.isFinite(duration) && duration > 0) {
        finish(duration);
        return;
      }
      finish(null);
    };

    const handleError = () => {
      finish(null);
    };

    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleError);
    try {
      audio.src = sourceUrl;
      audio.load();
    } catch {
      finish(null);
    }
  });
}

export async function analyzeAudioFile(file: File): Promise<{
  durationSeconds: number | null;
  energy: number;
  mood: 'calm' | 'balanced' | 'energetic';
}> {
  const globalWithAudio = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const audioContextCtor = globalWithAudio.AudioContext ?? globalWithAudio.webkitAudioContext;

  if (!audioContextCtor) {
    return { durationSeconds: null, energy: 0.5, mood: 'balanced' };
  }

  const context = new audioContextCtor();
  try {
    const buffer = await file.arrayBuffer();
    const audioBuffer = await context.decodeAudioData(buffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    const stride = Math.max(1, Math.floor(channel.length / 5000));
    let sum = 0;
    let samples = 0;

    for (let index = 0; index < channel.length; index += stride) {
      const value = channel[index] ?? 0;
      sum += value * value;
      samples += 1;
    }

    const rms = samples > 0 ? Math.sqrt(sum / samples) : 0;
    const energy = Math.max(0, Math.min(1, rms * 4));
    const mood = energy < 0.28 ? 'calm' : energy > 0.62 ? 'energetic' : 'balanced';

    return {
      durationSeconds: Number.isFinite(audioBuffer.duration) ? audioBuffer.duration : null,
      energy,
      mood,
    };
  } catch {
    return { durationSeconds: null, energy: 0.5, mood: 'balanced' };
  } finally {
    await context.close().catch(() => undefined);
  }
}
