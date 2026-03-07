type MediaTab = "videos" | "images" | "upload";
type MediaKind = "video" | "image";

type ViewerMedia = {
  tab: MediaTab;
  id: string;
  kind: MediaKind;
  title: string;
  url: string;
  youtubeId?: string;
  timestampLabel?: string;
  initialSeekSeconds?: number;
  isObjectUrl?: boolean;
};

export const VIEWER_FPS_FALLBACK = 30;

export function getViewerFrameRate(
  viewerDetectedFps: number | null,
  fallback = VIEWER_FPS_FALLBACK
): number {
  if (typeof viewerDetectedFps === "number" && Number.isFinite(viewerDetectedFps) && viewerDetectedFps > 0) {
    return viewerDetectedFps;
  }
  return fallback;
}

export function getViewerFrameDurationSeconds(
  viewerDetectedFps: number | null,
  fallback = VIEWER_FPS_FALLBACK
): number {
  const fps = getViewerFrameRate(viewerDetectedFps, fallback);
  return fps > 0 ? 1 / fps : 1 / fallback;
}

export function getViewerFrameBase(
  viewerDetectedFps: number | null,
  fallback = VIEWER_FPS_FALLBACK
): number {
  const base = Math.round(getViewerFrameRate(viewerDetectedFps, fallback));
  return Math.max(1, Number.isFinite(base) ? base : fallback);
}

export function startViewerFrameRateProbe(
  video: HTMLVideoElement,
  onFpsSample: (fps: number) => void
): (() => void) | null {
  const callbackFn = (video as HTMLVideoElement & {
    requestVideoFrameCallback?: (
      callback: (now: number, metadata: { mediaTime?: number; presentedFrames?: number }) => void
    ) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  }).requestVideoFrameCallback;
  if (typeof callbackFn !== "function") {
    return null;
  }
  const cancelFn = (video as HTMLVideoElement & {
    cancelVideoFrameCallback?: (handle: number) => void;
  }).cancelVideoFrameCallback;
  let canceled = false;
  let handle: number | null = null;
  let lastMediaTime: number | null = null;
  let lastPresentedFrames: number | null = null;
  const samples: number[] = [];
  const maxSamples = 48;

  const computeMedian = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) * 0.5;
    }
    return sorted[middle];
  };

  const schedule = () => {
    if (canceled) {
      return;
    }
    handle = callbackFn.call(video, (_now, metadata) => {
      if (canceled) {
        return;
      }
      const mediaTime = typeof metadata.mediaTime === "number" ? metadata.mediaTime : null;
      const presentedFrames =
        typeof metadata.presentedFrames === "number" ? metadata.presentedFrames : null;
      if (mediaTime !== null) {
        if (lastMediaTime !== null && mediaTime > lastMediaTime) {
          let frameDelta = 1;
          if (
            presentedFrames !== null &&
            lastPresentedFrames !== null &&
            presentedFrames > lastPresentedFrames
          ) {
            frameDelta = presentedFrames - lastPresentedFrames;
          }
          const fpsSample = frameDelta / (mediaTime - lastMediaTime);
          if (Number.isFinite(fpsSample) && fpsSample > 1 && fpsSample < 240) {
            samples.push(fpsSample);
            if (samples.length > maxSamples) {
              samples.shift();
            }
            onFpsSample(computeMedian(samples));
          }
        }
        lastMediaTime = mediaTime;
      }
      if (presentedFrames !== null) {
        lastPresentedFrames = presentedFrames;
      }
      schedule();
    });
  };

  schedule();
  return () => {
    canceled = true;
    if (handle !== null && typeof cancelFn === "function") {
      cancelFn.call(video, handle);
    }
  };
}

export function clampVideoTime(video: HTMLVideoElement, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return Math.min(seconds, video.duration);
  }
  return seconds;
}

export function parseFrameSuffix(raw: string): { base: string; frame: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const pipeIndex = trimmed.lastIndexOf("|");
  if (pipeIndex < 0) {
    return { base: trimmed, frame: 0 };
  }
  const base = trimmed.slice(0, pipeIndex).trim();
  const frameRaw = trimmed.slice(pipeIndex + 1).trim();
  if (!base) {
    return null;
  }
  if (!/^\d+$/.test(frameRaw)) {
    return null;
  }
  const frame = Number(frameRaw);
  if (!Number.isFinite(frame) || frame < 0) {
    return null;
  }
  return { base, frame };
}

export function getCurrentViewerTimeParts(
  viewerVideoNode: HTMLVideoElement | null,
  viewerActiveVideoContext: ViewerMedia | null,
  frameBase: number
): { seconds: number; frame: number } {
  if (!viewerVideoNode || !viewerActiveVideoContext) {
    return { seconds: 0, frame: 0 };
  }
  const safeTime = Math.max(0, Number.isFinite(viewerVideoNode.currentTime) ? viewerVideoNode.currentTime : 0);
  const wholeSeconds = Math.floor(safeTime);
  const fractional = safeTime - wholeSeconds;
  const frame = Math.max(0, Math.min(frameBase - 1, Math.floor(fractional * frameBase + 1e-6)));
  return { seconds: wholeSeconds, frame };
}

export function getShareBaseUrl(): URL {
  const candidates: Array<() => string> = [
    () => window.top?.location.href ?? "",
    () => window.parent?.location.href ?? "",
    () => window.location.href,
  ];
  for (const getHref of candidates) {
    try {
      const href = getHref();
      if (!href) {
        continue;
      }
      return new URL(href);
    } catch {
      // Ignore inaccessible cross-origin frames and invalid URL values.
    }
  }
  return new URL(window.location.href);
}

export function buildViewerShareUrl(
  context: ViewerMedia | null,
  timeParts: { seconds: number; frame: number }
): string | null {
  if (!context) {
    return null;
  }
  const shareUrl = getShareBaseUrl();
  shareUrl.hash = "";
  shareUrl.search = "";

  const preferredId =
    context.id && context.id !== "raw-url" && context.id !== "upload-file"
      ? context.id
      : "";
  if (preferredId) {
    shareUrl.searchParams.set("id", preferredId);
  } else if (context.youtubeId) {
    shareUrl.searchParams.set("yt", context.youtubeId);
  } else {
    return null;
  }
  shareUrl.searchParams.set("t", String(timeParts.seconds));
  shareUrl.searchParams.set("f", String(timeParts.frame));
  return shareUrl.toString();
}

export function buildViewerYoutubeUrl(
  context: ViewerMedia | null,
  timeParts: { seconds: number; frame: number }
): string | null {
  if (!context?.youtubeId) {
    return null;
  }
  const ytUrl = new URL("https://www.youtube.com/watch");
  ytUrl.searchParams.set("v", context.youtubeId);
  ytUrl.searchParams.set("t", String(timeParts.seconds));
  return ytUrl.toString();
}
