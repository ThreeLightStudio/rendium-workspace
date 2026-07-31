export type TimelineSeekHandler = (timeSeconds: number) => void;

let seekHandler: TimelineSeekHandler | null = null;

export function registerTimelineSeekHandler(handler: TimelineSeekHandler): () => void {
  seekHandler = handler;

  return () => {
    if (seekHandler === handler) {
      seekHandler = null;
    }
  };
}

export function hasTimelineSeekHandler(): boolean {
  return seekHandler !== null;
}

export function seekTimeline(timeSeconds: number): boolean {
  if (!seekHandler) {
    return false;
  }

  seekHandler(timeSeconds);
  return true;
}
