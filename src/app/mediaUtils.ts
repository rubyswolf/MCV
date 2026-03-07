import { normalizeLineRefs } from "./geometry";

type ManualAxis = "x" | "y" | "z";

type ManualPoint = {
  x: number;
  y: number;
};

type ManualAnnotation = {
  from: ManualPoint;
  to: ManualPoint;
  axis: ManualAxis;
  length?: number;
};

type StructureAnchor = {
  from: number[];
  to: number[];
  vertex: number;
  x?: number;
  y?: number;
  z?: number;
};

type StructureVertexData = {
  from: number[];
  to: number[];
  anchor?: number;
  x?: number;
  y?: number;
  z?: number;
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

type SearchIntent = {
  query: string;
  parsedUrl: URL | null;
  youtubeId: string | null;
  normalizedUrl: string | null;
};

type MediaKind = "video" | "image";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeVideos(value: unknown): Record<string, MediaVideoEntry> {
  if (!isRecord(value)) {
    return {};
  }
  const output: Record<string, MediaVideoEntry> = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry)) {
      continue;
    }
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    if (!name || !url) {
      continue;
    }
    const youtubeId =
      typeof entry.youtube_id === "string" && entry.youtube_id.trim()
        ? entry.youtube_id.trim()
        : undefined;
    output[id] = {
      name,
      url,
      ...(youtubeId ? { youtube_id: youtubeId } : {}),
    };
  }
  return output;
}

export function normalizeImages(value: unknown): Record<string, MediaImageEntry> {
  if (!isRecord(value)) {
    return {};
  }
  const output: Record<string, MediaImageEntry> = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry)) {
      continue;
    }
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    if (!name || !url) {
      continue;
    }
    output[id] = { name, url };
  }
  return output;
}

export function parseMediaLibrary(payload: unknown): MediaLibrary | null {
  if (!isRecord(payload)) {
    return null;
  }
  return {
    videos: normalizeVideos(payload.videos),
    images: normalizeImages(payload.images),
  };
}

export function parseUrlOrNull(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isYoutubeUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    host === "youtu.be" ||
    host === "www.youtu.be" ||
    host.endsWith("youtube.com")
  );
}

export function extractYoutubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const pathParts = url.pathname.split("/").filter(Boolean);
  let candidate = "";

  if (host === "youtu.be" || host === "www.youtu.be") {
    candidate = pathParts[0] || "";
  } else if (host.endsWith("youtube.com")) {
    if (url.pathname === "/watch") {
      candidate = url.searchParams.get("v") || "";
    } else if (pathParts.length >= 2 && ["shorts", "embed", "live", "v"].includes(pathParts[0])) {
      candidate = pathParts[1] || "";
    }
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }
  return /^[A-Za-z0-9_-]{6,}$/.test(trimmed) ? trimmed : null;
}

export function parseTimestampSeconds(raw: string): number | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  if (/^\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (value.includes(":")) {
    const parts = value.split(":").map((part) => part.trim());
    if (parts.some((part) => !part)) {
      return null;
    }
    if (parts.length < 2 || parts.length > 3) {
      return null;
    }
    const numeric = parts.map((part) => Number(part));
    if (numeric.some((part) => Number.isNaN(part) || part < 0)) {
      return null;
    }
    if (parts.length === 2) {
      const [minutes, seconds] = numeric;
      return minutes * 60 + seconds;
    }
    const [hours, minutes, seconds] = numeric;
    return hours * 3600 + minutes * 60 + seconds;
  }
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s?)?$/i);
  if (!match) {
    return null;
  }
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  const seconds = match[3] ? Number(match[3]) : 0;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

export function formatTimestamp(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(wholeSeconds / 3600);
  const mins = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function extractYoutubeTimestampLabel(url: URL): string | undefined {
  const raw = (url.searchParams.get("t") || "").trim();
  if (!raw) {
    return undefined;
  }
  const seconds = parseTimestampSeconds(raw);
  if (seconds === null) {
    return raw;
  }
  return formatTimestamp(seconds);
}

export function normalizeSearchToken(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeUrlForMatch(url: URL): string {
  const clone = new URL(url.toString());
  clone.hash = "";
  clone.searchParams.delete("t");
  return clone.toString();
}

export function parseSearchIntent(rawQuery: string): SearchIntent {
  const query = rawQuery.trim();
  const parsedUrl = parseUrlOrNull(query);
  const youtubeId = parsedUrl && isYoutubeUrl(parsedUrl) ? extractYoutubeId(parsedUrl) : null;
  const normalizedUrl = parsedUrl ? normalizeUrlForMatch(parsedUrl) : null;
  return { query, parsedUrl, youtubeId, normalizedUrl };
}

export function normalizePossibleUrl(value: string): string | null {
  const parsed = parseUrlOrNull(value);
  if (!parsed) {
    return null;
  }
  return normalizeUrlForMatch(parsed);
}

export function inferMediaKindFromUrl(url: URL): MediaKind {
  const pathname = url.pathname.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|bmp|svg|avif)$/.test(pathname)) {
    return "image";
  }
  if (/\.(mp4|webm|mov|m4v|ogv|mkv)$/.test(pathname)) {
    return "video";
  }
  return "video";
}

export function inferMediaKindFromFile(file: File): MediaKind {
  if (file.type.startsWith("image/")) {
    return "image";
  }
  if (file.type.startsWith("video/")) {
    return "video";
  }
  const fakeUrl = parseUrlOrNull(`https://local.invalid/${encodeURIComponent(file.name)}`);
  return fakeUrl ? inferMediaKindFromUrl(fakeUrl) : "video";
}

export function isSvgFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === "image/svg+xml" || name.endsWith(".svg");
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file text"));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  });
}

export function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(blob);
  });
}

export async function ensureEmbeddedImageDataUrl(source: string): Promise<string> {
  if (source.startsWith("data:")) {
    return source;
  }
  if (source.startsWith("blob:")) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch image blob: ${response.status}`);
    }
    const blob = await response.blob();
    return await readBlobAsDataUrl(blob);
  }
  const response = await fetch(source, { mode: "cors" });
  if (!response.ok) {
    throw new Error(`Failed to fetch image source: ${response.status}`);
  }
  return await readBlobAsDataUrl(await response.blob());
}

export function normalizeImportedAxis(value: unknown): ManualAxis | null {
  return value === "x" || value === "y" || value === "z" ? value : null;
}

export function normalizeImportedSource(value: unknown): McvDataSource | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const item = value as Record<string, unknown>;
  if (item.type === "video" && typeof item.filename === "string") {
    const seconds =
      typeof item.seconds === "number" && Number.isFinite(item.seconds) && item.seconds >= 0
        ? Math.floor(item.seconds)
        : 0;
    const frames =
      typeof item.frames === "number" && Number.isFinite(item.frames) && item.frames >= 0
        ? Math.floor(item.frames)
        : 0;
    return {
      type: "video",
      filename: item.filename,
      seconds,
      frames,
    };
  }
  const type = item.type;
  const id = item.id;
  const name = item.name;
  const url = item.url;
  if ((type !== "video" && type !== "image") || typeof id !== "string" || typeof name !== "string" || typeof url !== "string") {
    return undefined;
  }
  const source: McvDataSource = {
    type,
    id,
    name,
    url,
  };
  if (type === "video" && typeof item.youtube_id === "string" && item.youtube_id.trim()) {
    source.youtube_id = item.youtube_id;
  }
  if (type === "video" && typeof item.seconds === "number" && Number.isFinite(item.seconds) && item.seconds >= 0) {
    source.seconds = Math.floor(item.seconds);
  }
  if (type === "video" && typeof item.frames === "number" && Number.isFinite(item.frames) && item.frames >= 0) {
    source.frames = Math.floor(item.frames);
  }
  return source;
}

export function normalizeImportedLineRefs(value: unknown, maxLines: number): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return normalizeLineRefs(
    value
      .map((item) => (typeof item === "number" && Number.isInteger(item) ? item : -1))
      .filter((index) => index >= 0 && index < maxLines)
  );
}

export function normalizeImportedMcvData(value: unknown): {
  annotations: ManualAnnotation[];
  anchors: StructureAnchor[];
  vertices: StructureVertexData[];
  source?: McvDataSource;
} | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.annotations)) {
    return null;
  }

  const annotations: ManualAnnotation[] = [];
  for (const entry of data.annotations) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const item = entry as Record<string, unknown>;
    const axis = normalizeImportedAxis(item.axis);
    const fromObj = item.from as Record<string, unknown> | undefined;
    const toObj = item.to as Record<string, unknown> | undefined;
    const fx = typeof fromObj?.x === "number" ? fromObj.x : null;
    const fy = typeof fromObj?.y === "number" ? fromObj.y : null;
    const tx = typeof toObj?.x === "number" ? toObj.x : null;
    const ty = typeof toObj?.y === "number" ? toObj.y : null;
    if (axis === null || fx === null || fy === null || tx === null || ty === null) {
      continue;
    }
    const line: ManualAnnotation = {
      from: { x: fx, y: fy },
      to: { x: tx, y: ty },
      axis,
    };
    if (typeof item.length === "number" && Number.isFinite(item.length) && item.length > 0) {
      line.length = item.length;
    }
    annotations.push(line);
  }

  const structure = data.structure as Record<string, unknown> | undefined;
  const maxLines = annotations.length;
  const parsedVertices: StructureVertexData[] = [];
  if (Array.isArray(structure?.vertices)) {
    for (const raw of structure.vertices as unknown[]) {
      if (typeof raw !== "object" || raw === null) {
        continue;
      }
      const item = raw as Record<string, unknown>;
      const vertex: StructureVertexData = {
        from: normalizeImportedLineRefs(item.from, maxLines),
        to: normalizeImportedLineRefs(item.to, maxLines),
      };
      if (typeof item.anchor === "number" && Number.isInteger(item.anchor) && item.anchor >= 0) {
        vertex.anchor = item.anchor;
      }
      if (typeof item.x === "number" && Number.isFinite(item.x)) {
        vertex.x = item.x;
      }
      if (typeof item.y === "number" && Number.isFinite(item.y)) {
        vertex.y = item.y;
      }
      if (typeof item.z === "number" && Number.isFinite(item.z)) {
        vertex.z = item.z;
      }
      parsedVertices.push(vertex);
    }
  }

  const parsedAnchors: StructureAnchor[] = [];
  if (Array.isArray(structure?.anchors)) {
    for (const raw of structure.anchors as unknown[]) {
      if (typeof raw !== "object" || raw === null) {
        continue;
      }
      const item = raw as Record<string, unknown>;
      const anchor: StructureAnchor = {
        from: normalizeImportedLineRefs(item.from, maxLines),
        to: normalizeImportedLineRefs(item.to, maxLines),
        vertex: typeof item.vertex === "number" && Number.isInteger(item.vertex) && item.vertex >= 0 ? item.vertex : -1,
      };
      if (typeof item.x === "number" && Number.isFinite(item.x)) {
        anchor.x = item.x;
      }
      if (typeof item.y === "number" && Number.isFinite(item.y)) {
        anchor.y = item.y;
      }
      if (typeof item.z === "number" && Number.isFinite(item.z)) {
        anchor.z = item.z;
      }
      parsedAnchors.push(anchor);
    }
  }

  const vertices: StructureVertexData[] = parsedVertices.map((vertex) => ({
    ...vertex,
    from: normalizeLineRefs(vertex.from),
    to: normalizeLineRefs(vertex.to),
  }));

  parsedAnchors.forEach((anchor, anchorIndex) => {
    let vertexIndex = anchor.vertex;
    if (vertexIndex < 0 || vertexIndex >= vertices.length) {
      vertexIndex = vertices.length;
      vertices.push({
        from: normalizeLineRefs(anchor.from),
        to: normalizeLineRefs(anchor.to),
        ...(anchor.x !== undefined ? { x: anchor.x } : {}),
        ...(anchor.y !== undefined ? { y: anchor.y } : {}),
        ...(anchor.z !== undefined ? { z: anchor.z } : {}),
        anchor: anchorIndex,
      });
      anchor.vertex = vertexIndex;
    } else {
      const vertex = vertices[vertexIndex];
      vertex.anchor = anchorIndex;
      if (anchor.x !== undefined) {
        vertex.x = anchor.x;
      }
      if (anchor.y !== undefined) {
        vertex.y = anchor.y;
      }
      if (anchor.z !== undefined) {
        vertex.z = anchor.z;
      }
      anchor.vertex = vertexIndex;
    }
  });

  vertices.forEach((vertex) => {
    if (vertex.anchor !== undefined && (vertex.anchor < 0 || vertex.anchor >= parsedAnchors.length)) {
      delete vertex.anchor;
    }
  });

  const source = normalizeImportedSource(data.source);

  return {
    annotations,
    anchors: parsedAnchors,
    vertices,
    ...(source ? { source } : {}),
  };
}
