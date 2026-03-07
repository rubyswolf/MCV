type MediaTab = "videos" | "images" | "upload";
type MediaKind = "video" | "image";

type MediaVideoEntry = {
  name: string;
  url: string;
  youtube_id?: string;
};

type MediaImageEntry = {
  name: string;
  url: string;
};

type MediaLibrary = {
  videos: Record<string, MediaVideoEntry>;
  images: Record<string, MediaImageEntry>;
};

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

type LaunchSelectionIntent = {
  mode: "id" | "yt";
  value: string;
  tRaw: string;
  fRaw: string;
};

type McvMediaApiSource = {
  type: "video" | "image";
  id: string;
  name: string;
  url: string;
  youtube_id?: string;
  seconds?: number;
  frames?: number;
};

type McvUploadedVideoSource = {
  type: "video";
  filename: string;
  seconds: number;
  frames: number;
};

type McvDataSource = McvMediaApiSource | McvUploadedVideoSource;

type SearchIntent = {
  query: string;
  parsedUrl: URL | null;
  youtubeId: string | null;
  normalizedUrl: string | null;
};

export function findVideoByYoutubeId(
  mediaLibrary: MediaLibrary,
  youtubeId: string
): { id: string; item: MediaVideoEntry } | null {
  for (const [id, item] of Object.entries(mediaLibrary.videos)) {
    if (id === youtubeId || item.youtube_id === youtubeId) {
      return { id, item };
    }
  }
  return null;
}

export function findMediaById(mediaLibrary: MediaLibrary, id: string): ViewerMedia | null {
  if (mediaLibrary.videos[id]) {
    const video = mediaLibrary.videos[id];
    return {
      tab: "videos",
      id,
      kind: "video",
      title: video.name,
      url: video.url,
      youtubeId: video.youtube_id,
    };
  }
  if (mediaLibrary.images[id]) {
    const image = mediaLibrary.images[id];
    return {
      tab: "images",
      id,
      kind: "image",
      title: image.name,
      url: image.url,
    };
  }
  return null;
}

export function splitSecondsAndFrames(
  secondsValue: number,
  frameBase: number
): { seconds: number; frames: number } {
  const safe = Math.max(0, Number.isFinite(secondsValue) ? secondsValue : 0);
  const seconds = Math.floor(safe);
  const fractional = safe - seconds;
  const frames = Math.max(0, Math.min(frameBase - 1, Math.floor(fractional * frameBase + 1e-6)));
  return { seconds, frames };
}

export function buildMcvSourceFromViewer(
  mediaLibrary: MediaLibrary,
  viewer: ViewerMedia,
  frameBase: number
): McvDataSource | null {
  if (viewer.id === "raw-url" || viewer.id === "upload-file") {
    return null;
  }
  if (viewer.tab === "videos") {
    const videoEntry = mediaLibrary.videos[viewer.id];
    if (!videoEntry) {
      return null;
    }
    const source: McvDataSource = {
      type: "video",
      id: viewer.id,
      name: videoEntry.name,
      url: videoEntry.url,
      ...(videoEntry.youtube_id ? { youtube_id: videoEntry.youtube_id } : {}),
    };
    if (viewer.initialSeekSeconds !== undefined) {
      const { seconds, frames } = splitSecondsAndFrames(viewer.initialSeekSeconds, frameBase);
      source.seconds = seconds;
      source.frames = frames;
    }
    return source;
  }
  if (viewer.tab === "images") {
    const imageEntry = mediaLibrary.images[viewer.id];
    if (!imageEntry) {
      return null;
    }
    return {
      type: "image",
      id: viewer.id,
      name: imageEntry.name,
      url: imageEntry.url,
    };
  }
  return null;
}

export function findMediaByNormalizedUrl(
  mediaLibrary: MediaLibrary,
  activeMediaTab: MediaTab,
  normalizedUrl: string,
  normalizePossibleUrl: (value: string) => string | null
): ViewerMedia | null {
  const tabOrder: MediaTab[] =
    activeMediaTab === "videos" ? ["videos", "images"] : ["images", "videos"];

  for (const tab of tabOrder) {
    const entries =
      tab === "videos"
        ? Object.entries(mediaLibrary.videos)
        : Object.entries(mediaLibrary.images);
    for (const [id, item] of entries) {
      const itemUrl = normalizePossibleUrl(item.url);
      if (itemUrl && itemUrl === normalizedUrl) {
        if (tab === "videos") {
          const videoItem = item as MediaVideoEntry;
          return {
            tab: "videos",
            id,
            kind: "video",
            title: videoItem.name,
            url: videoItem.url,
            ...(videoItem.youtube_id ? { youtubeId: videoItem.youtube_id } : {}),
          };
        }
        const imageItem = item as MediaImageEntry;
        return {
          tab: "images",
          id,
          kind: "image",
          title: imageItem.name,
          url: imageItem.url,
        };
      }
    }
  }

  return null;
}

export function resolveVideoViewerFromSource(
  mediaLibrary: MediaLibrary,
  activeMediaTab: MediaTab,
  source: McvDataSource,
  normalizePossibleUrl: (value: string) => string | null
): ViewerMedia | null {
  if (source.type !== "video") {
    return null;
  }
  if (!("id" in source) || !("url" in source)) {
    return null;
  }
  const byId = findMediaById(mediaLibrary, source.id);
  if (byId && byId.kind === "video") {
    return byId;
  }
  if (source.youtube_id) {
    const byYoutube = findVideoByYoutubeId(mediaLibrary, source.youtube_id);
    if (byYoutube) {
      return {
        tab: "videos",
        id: byYoutube.id,
        kind: "video",
        title: byYoutube.item.name,
        url: byYoutube.item.url,
        ...(byYoutube.item.youtube_id ? { youtubeId: byYoutube.item.youtube_id } : {}),
      };
    }
  }
  const normalizedSourceUrl = normalizePossibleUrl(source.url);
  if (normalizedSourceUrl) {
    const byUrl = findMediaByNormalizedUrl(
      mediaLibrary,
      activeMediaTab,
      normalizedSourceUrl,
      normalizePossibleUrl
    );
    if (byUrl && byUrl.kind === "video") {
      return byUrl;
    }
  }
  return null;
}

export function parseLaunchSelectionIntent(): LaunchSelectionIntent | null {
  const candidates: string[] = [];

  const pushCandidate = (value: string | null | undefined) => {
    if (!value) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    candidates.push(trimmed);
  };

  pushCandidate(window.location.search);
  pushCandidate(window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash);

  try {
    if (window.parent && window.parent !== window) {
      pushCandidate(window.parent.location.search);
      pushCandidate(
        window.parent.location.hash.startsWith("#")
          ? window.parent.location.hash.slice(1)
          : window.parent.location.hash
      );
    }
  } catch {
    // Cross-origin parent access can fail; ignore and continue with local params.
  }

  try {
    if (window.top && window.top !== window && window.top !== window.parent) {
      pushCandidate(window.top.location.search);
      pushCandidate(
        window.top.location.hash.startsWith("#")
          ? window.top.location.hash.slice(1)
          : window.top.location.hash
      );
    }
  } catch {
    // Cross-origin top access can fail; ignore and continue with available params.
  }

  for (const candidate of candidates) {
    const normalized = candidate.startsWith("?")
      ? candidate.slice(1)
      : candidate.startsWith("#")
        ? candidate.slice(1)
        : candidate;
    const queryPart = normalized.includes("?")
      ? normalized.slice(normalized.indexOf("?") + 1)
      : normalized;
    const params = new URLSearchParams(queryPart);
    const idValue = (params.get("id") || "").trim();
    const ytValue = (params.get("yt") || "").trim();
    const tRaw = (params.get("t") || "").trim();
    const fRaw = (params.get("f") || "").trim();

    if (idValue) {
      return { mode: "id", value: idValue, tRaw, fRaw };
    }
    if (ytValue) {
      return { mode: "yt", value: ytValue, tRaw, fRaw };
    }
  }

  return null;
}

export function buildLaunchSeekInfo(
  intent: LaunchSelectionIntent,
  frameBase: number,
  parseTimestampSeconds: (raw: string) => number | null,
  formatTimestamp: (seconds: number) => string
): {
  initialSeekSeconds?: number;
  timestampLabel?: string;
} {
  const hasT = intent.tRaw.length > 0;
  const hasF = intent.fRaw.length > 0;
  if (!hasT && !hasF) {
    return {};
  }

  const parsedT = hasT ? parseTimestampSeconds(intent.tRaw) : 0;
  if (parsedT === null) {
    return {};
  }

  let frame = 0;
  if (hasF) {
    if (!/^\d+$/.test(intent.fRaw)) {
      return { initialSeekSeconds: Math.max(0, parsedT), timestampLabel: `${intent.tRaw || "0"}|0` };
    }
    frame = Math.max(0, Number(intent.fRaw));
  }

  const initialSeekSeconds = Math.max(0, parsedT) + frame / frameBase;
  const displayFrame = frame % frameBase;
  const displaySeconds = Math.max(0, Math.floor(parsedT + Math.floor(frame / frameBase)));
  const timestampLabel = `${formatTimestamp(displaySeconds)}|${displayFrame}`;
  return { initialSeekSeconds, timestampLabel };
}

export function setTabButtonState(activeMediaTab: MediaTab): void {
  const videosButton = document.getElementById("tab-videos") as HTMLButtonElement | null;
  const imagesButton = document.getElementById("tab-images") as HTMLButtonElement | null;
  const uploadButton = document.getElementById("tab-upload") as HTMLButtonElement | null;
  if (!videosButton || !imagesButton || !uploadButton) {
    return;
  }
  const isVideos = activeMediaTab === "videos";
  const isImages = activeMediaTab === "images";
  const isUpload = activeMediaTab === "upload";
  videosButton.classList.toggle("active", isVideos);
  imagesButton.classList.toggle("active", isImages);
  uploadButton.classList.toggle("active", isUpload);
}

export function matchesMediaSearch(
  mediaSearchQuery: string,
  id: string,
  item: MediaVideoEntry | MediaImageEntry,
  tab: MediaTab,
  utils: {
    normalizeSearchToken: (value: string) => string;
    parseSearchIntent: (rawQuery: string) => SearchIntent;
    normalizePossibleUrl: (value: string) => string | null;
  }
): boolean {
  const query = utils.normalizeSearchToken(mediaSearchQuery);
  if (!query) {
    return true;
  }

  const intent = utils.parseSearchIntent(mediaSearchQuery);

  if (intent.youtubeId && tab === "videos") {
    const videoItem = item as MediaVideoEntry;
    if (id === intent.youtubeId || videoItem.youtube_id === intent.youtubeId) {
      return true;
    }
  }

  if (intent.normalizedUrl) {
    const itemNormalizedUrl = utils.normalizePossibleUrl(item.url);
    if (itemNormalizedUrl && itemNormalizedUrl === intent.normalizedUrl) {
      return true;
    }
    if (
      utils.normalizeSearchToken(item.url).includes(query) ||
      query.includes(utils.normalizeSearchToken(item.url))
    ) {
      return true;
    }
  }

  const haystack = [id, item.name, item.url];
  if (tab === "videos") {
    const videoItem = item as MediaVideoEntry;
    if (videoItem.youtube_id) {
      haystack.push(videoItem.youtube_id);
    }
  }
  return haystack.some((value) => utils.normalizeSearchToken(value).includes(query));
}
