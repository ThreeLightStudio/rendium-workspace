export function parseTimecodeToSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withoutSuffix = trimmed.replace(/s$/i, '').trim();
  if (!withoutSuffix) {
    return null;
  }

  if (/^[+-]?\d+(?:\.\d+)?$/.test(withoutSuffix)) {
    const seconds = Number(withoutSuffix);
    return Number.isFinite(seconds) ? Math.max(0, seconds) : null;
  }

  const parts = withoutSuffix.split(':');
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }

  const [hoursPart, minutesPart, secondsPart] =
    parts.length === 3 ? parts : ['0', parts[0], parts[1]];
  if (!hoursPart || !minutesPart || !secondsPart) {
    return null;
  }

  if (
    !/^\d+$/.test(hoursPart) ||
    !/^\d+$/.test(minutesPart) ||
    !/^\d+(?:\.\d+)?$/.test(secondsPart)
  ) {
    return null;
  }

  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);
  const seconds = Number(secondsPart);
  if (![hours, minutes, seconds].every((component) => Number.isFinite(component))) {
    return null;
  }

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return totalSeconds >= 0 ? totalSeconds : null;
}

export function formatTimecode(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const wholeSeconds = Math.floor(safeSeconds);
  let milliseconds = Math.round((safeSeconds - wholeSeconds) * 1000);
  let totalWholeSeconds = wholeSeconds;

  if (milliseconds === 1000) {
    milliseconds = 0;
    totalWholeSeconds += 1;
  }

  const hours = Math.floor(totalWholeSeconds / 3600);
  const minutes = Math.floor((totalWholeSeconds % 3600) / 60);
  const remainingSeconds = totalWholeSeconds % 60;
  const base = `${pad2(hours)}:${pad2(minutes)}:${pad2(remainingSeconds)}`;

  return milliseconds > 0 ? `${base}.${pad3(milliseconds)}` : base;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function pad3(value: number): string {
  return String(value).padStart(3, '0');
}
