type McvOperation = "cv.opencvTest";

type McvRequest<TArgs = Record<string, unknown>> = {
  op: McvOperation;
  args: TArgs;
};

type McvSuccess<TData> = {
  ok: true;
  data: TData;
};

type McvFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type McvResponse<TData> = McvSuccess<TData> | McvFailure;

type McvOpencvTestResult = {
  opencv_version: string;
  gray_values: number[];
  shape: number[];
  mean_gray: number;
};

type McvImagePipelineArgs = {
  image_data_url: string;
  canny_threshold1?: number;
  canny_threshold2?: number;
};

type McvLineSegment = [number, number, number, number];
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
type StructureEndpoint = ManualPoint & {
  from: number[];
  to: number[];
};
type StructureLine = {
  from: StructureEndpoint;
  to: StructureEndpoint;
  axis: ManualAxis;
  length?: number;
};
type StructureData = {
  lines: StructureLine[];
};
type DraftManualLine = {
  from: ManualPoint;
  to: ManualPoint;
  axis: ManualAxis;
  flipped: boolean;
  length?: number;
};

type McvImagePipelineResult = {
  grayscale_image_data_url: string;
  line_segments: McvLineSegment[];
  width: number;
  height: number;
  duration_ms?: number;
};

type McvImagePipelineHttpResponse = {
  ok: boolean;
  data?: McvImagePipelineResult;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

type McvMediaApi = {
  url: string;
  available: () => boolean;
  fetch: () => Promise<Response>;
};

type McvDataApi = {
  url: string;
  available: () => boolean;
};

type McvClientApi = {
  media: McvMediaApi;
  data: McvDataApi;
  mcv: {
    call: typeof callMcvApi;
    runImagePipeline: typeof runImagePipeline;
    backend: "python" | "web";
  };
};

type MediaTab = "videos" | "images" | "upload";
type MediaLoadState = "loading" | "no_api" | "fetching" | "failed" | "loaded";

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

declare global {
  interface Window {
    MCV_API?: McvClientApi;
    MCV_DATA?: {
      annotations: ManualAnnotation[];
      structure: StructureData;
    };
  }
}

declare const __MCV_BACKEND__: "python" | "web";
declare const __MCV_OPENCV_URL__: string;
declare const __MCV_MEDIA_API_URL__: string;
declare const __MCV_DATA_API_URL__: string;

let cvPromise: Promise<unknown> | null = null;
let activeMediaTab: MediaTab = "videos";
let mediaLoadState: MediaLoadState = "loading";
let mediaSearchQuery = "";
let selectedUploadFilename = "";
let viewerMedia: ViewerMedia | null = null;
let currentViewerObjectUrl: string | null = null;
let currentAnalyzedImageObjectUrl: string | null = null;
let viewerVideoNode: HTMLVideoElement | null = null;
let viewerHmsInput: HTMLInputElement | null = null;
let viewerEditingField: "hms" | null = null;
let launchSelectionIntent: LaunchSelectionIntent | null = null;
let cropResultCache:
  | {
      colorDataUrl: string;
      width: number;
      height: number;
    }
  | null = null;
let manualAxisSelection: ManualAxis = "x";
let manualAxisStartsBackwards = false;
const MCV_DATA: { annotations: ManualAnnotation[]; structure: StructureData } = {
  annotations: [],
  structure: {
    lines: [],
  },
};
let manualRedoLines: ManualAnnotation[] = [];
let manualDraftLine: DraftManualLine | null = null;
let manualDragPointerId: number | null = null;
let manualDragClientX = 0;
let manualDragClientY = 0;
let viewerCtrlHeld = false;
let renderAnnotationPreviewHeld = false;
let viewerMotionRafId: number | null = null;
const viewerMotion = {
  x: 0,
  y: 0,
  velX: 0,
  velY: 0,
  zoom: 1,
};
const viewerInput = {
  grabbed: false,
  pointerId: null as number | null,
  x: 0,
  y: 0,
};
let mediaLibrary: MediaLibrary = {
  videos: {},
  images: {},
};

const NO_YOUTUBE_VIDEO_ERROR =
  "video is not provided by the Media API, please download the video yourself and upload it.";
const NO_MEDIA_ID_ERROR = "media ID is not provided by the Media API.";
const VIEWER_FPS = 30;
// const movement = {speed: 1.0,friction: 1.0,grip: 1.0,stop: 1.0,slip: 0.0,buildup: 0,zoomSpeed: 0.001} //sharp
// const movement = {speed: 1.0,friction: 0.05,grip: 1.0,stop: 1.0,slip: 0.0,buildup: 0,zoomSpeed: 0.001} //smooth
const movement = {
  speed: 1.0,
  friction: 0.05,
  grip: 0.2,
  stop: 0.0,
  slip: 1.0,
  buildup: 0.1,
  zoomSpeed: 0.001,
}; //buttery
// const movement = {speed: 1.0,friction: 0.05,grip: 0.2,stop: 0.0,slip: 1.0,buildup: 0.5,zoomSpeed: 0.001} //gliding

function getAnnotationLength(annotation: ManualAnnotation): number {
  return Math.hypot(annotation.to.x - annotation.from.x, annotation.to.y - annotation.from.y);
}

function computeStructureLinkThreshold(annotations: ManualAnnotation[]): number {
  if (annotations.length === 0) {
    return 3;
  }
  const lengths = annotations
    .map((annotation) => getAnnotationLength(annotation))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (lengths.length === 0) {
    return 3;
  }
  const median = lengths[Math.floor(lengths.length / 2)];
  return Math.max(2, Math.min(10, median * 0.08));
}

function linkStructureEndpoints(
  firstLine: StructureLine,
  firstEndpoint: "from" | "to",
  secondLine: StructureLine,
  secondEndpoint: "from" | "to",
  firstIndex: number,
  secondIndex: number
): void {
  const firstLinks = firstLine[firstEndpoint][secondEndpoint];
  if (!firstLinks.includes(secondIndex)) {
    firstLinks.push(secondIndex);
  }
  const secondLinks = secondLine[secondEndpoint][firstEndpoint];
  if (!secondLinks.includes(firstIndex)) {
    secondLinks.push(firstIndex);
  }
}

function createStructureLineFromAnnotation(annotation: ManualAnnotation): StructureLine {
  return {
    from: {
      x: annotation.from.x,
      y: annotation.from.y,
      from: [],
      to: [],
    },
    to: {
      x: annotation.to.x,
      y: annotation.to.y,
      from: [],
      to: [],
    },
    axis: annotation.axis,
    ...(annotation.length !== undefined && annotation.length > 0 ? { length: annotation.length } : {}),
  };
}

function getInfiniteLineIntersection(
  first: ManualAnnotation,
  second: ManualAnnotation
): ManualPoint | null {
  const x1 = first.from.x;
  const y1 = first.from.y;
  const x2 = first.to.x;
  const y2 = first.to.y;
  const x3 = second.from.x;
  const y3 = second.from.y;
  const x4 = second.to.x;
  const y4 = second.to.y;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-9) {
    return null;
  }
  const detFirst = x1 * y2 - y1 * x2;
  const detSecond = x3 * y4 - y3 * x4;
  const x = (detFirst * (x3 - x4) - (x1 - x2) * detSecond) / denom;
  const y = (detFirst * (y3 - y4) - (y1 - y2) * detSecond) / denom;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

function getLeastSquaresLinePoint(lines: ManualAnnotation[]): ManualPoint | null {
  let a00 = 0;
  let a01 = 0;
  let a11 = 0;
  let b0 = 0;
  let b1 = 0;
  let used = 0;
  for (const line of lines) {
    const dxRaw = line.to.x - line.from.x;
    const dyRaw = line.to.y - line.from.y;
    const length = Math.hypot(dxRaw, dyRaw);
    if (length < 1e-9) {
      continue;
    }
    used += 1;
    const dx = dxRaw / length;
    const dy = dyRaw / length;
    const m00 = 1 - dx * dx;
    const m01 = -dx * dy;
    const m11 = 1 - dy * dy;
    a00 += m00;
    a01 += m01;
    a11 += m11;
    b0 += m00 * line.from.x + m01 * line.from.y;
    b1 += m01 * line.from.x + m11 * line.from.y;
  }
  if (used < 2) {
    return null;
  }
  const det = a00 * a11 - a01 * a01;
  if (Math.abs(det) < 1e-9) {
    return null;
  }
  const x = (b0 * a11 - b1 * a01) / det;
  const y = (a00 * b1 - a01 * b0) / det;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

function setStructureEndpointPoint(
  endpointId: number,
  point: ManualPoint
): void {
  const lineIndex = Math.floor(endpointId / 2);
  const endpoint = endpointId % 2 === 0 ? "from" : "to";
  const line = MCV_DATA.structure.lines[lineIndex];
  if (!line) {
    return;
  }
  line[endpoint].x = point.x;
  line[endpoint].y = point.y;
}

function recomputeStructureGeometryFromConnections(): void {
  const annotations = MCV_DATA.annotations;
  const structureLines = MCV_DATA.structure.lines;
  if (annotations.length !== structureLines.length) {
    return;
  }

  // Always restart from raw annotations so refinement never cascades.
  for (let i = 0; i < structureLines.length; i += 1) {
    structureLines[i].from.x = annotations[i].from.x;
    structureLines[i].from.y = annotations[i].from.y;
    structureLines[i].to.x = annotations[i].to.x;
    structureLines[i].to.y = annotations[i].to.y;
  }

  const endpointCount = structureLines.length * 2;
  const adjacency = Array.from({ length: endpointCount }, () => new Set<number>());
  const connect = (a: number, b: number) => {
    if (a < 0 || b < 0 || a >= endpointCount || b >= endpointCount || a === b) {
      return;
    }
    adjacency[a].add(b);
    adjacency[b].add(a);
  };
  for (let i = 0; i < structureLines.length; i += 1) {
    const line = structureLines[i];
    const fromId = i * 2;
    const toId = i * 2 + 1;
    line.from.from.forEach((other) => connect(fromId, other * 2));
    line.from.to.forEach((other) => connect(fromId, other * 2 + 1));
    line.to.from.forEach((other) => connect(toId, other * 2));
    line.to.to.forEach((other) => connect(toId, other * 2 + 1));
  }

  const visited = new Array(endpointCount).fill(false);
  for (let start = 0; start < endpointCount; start += 1) {
    if (visited[start] || adjacency[start].size === 0) {
      continue;
    }
    const stack = [start];
    const component: number[] = [];
    visited[start] = true;
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      adjacency[current].forEach((next) => {
        if (!visited[next]) {
          visited[next] = true;
          stack.push(next);
        }
      });
    }
    const uniqueLineIndexes = Array.from(
      new Set(component.map((endpointId) => Math.floor(endpointId / 2)))
    );
    if (uniqueLineIndexes.length < 2) {
      continue;
    }
    const linesForSolve = uniqueLineIndexes.map((index) => annotations[index]);
    let snapPoint: ManualPoint | null = null;
    if (linesForSolve.length === 2) {
      snapPoint =
        getInfiniteLineIntersection(linesForSolve[0], linesForSolve[1]) ??
        getLeastSquaresLinePoint(linesForSolve);
    } else {
      snapPoint = getLeastSquaresLinePoint(linesForSolve);
    }
    if (!snapPoint) {
      continue;
    }
    component.forEach((endpointId) => {
      setStructureEndpointPoint(endpointId, snapPoint!);
    });
  }
}

function linkLineIndexAgainstOthers(lineIndex: number): void {
  const lines = MCV_DATA.structure.lines;
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return;
  }
  const annotations = MCV_DATA.annotations;
  const line = lines[lineIndex];
  line.from.from.length = 0;
  line.from.to.length = 0;
  line.to.from.length = 0;
  line.to.to.length = 0;

  const threshold = computeStructureLinkThreshold(MCV_DATA.annotations);
  for (let otherIndex = 0; otherIndex < lines.length; otherIndex += 1) {
    if (otherIndex === lineIndex) {
      continue;
    }
    const other = lines[otherIndex];
    if (other.axis === line.axis) {
      continue;
    }
    const lineAnnotation = annotations[lineIndex];
    const otherAnnotation = annotations[otherIndex];
    if (!lineAnnotation || !otherAnnotation) {
      continue;
    }
    (["from", "to"] as const).forEach((lineEndpoint) => {
      (["from", "to"] as const).forEach((otherEndpoint) => {
        const firstPoint = lineAnnotation[lineEndpoint];
        const secondPoint = otherAnnotation[otherEndpoint];
        const distance = Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y);
        if (distance <= threshold) {
          linkStructureEndpoints(line, lineEndpoint, other, otherEndpoint, lineIndex, otherIndex);
        }
      });
    });
  }
}

function pushAnnotationWithStructureLink(annotation: ManualAnnotation): void {
  MCV_DATA.annotations.push(annotation);
  MCV_DATA.structure.lines.push(createStructureLineFromAnnotation(annotation));
  linkLineIndexAgainstOthers(MCV_DATA.structure.lines.length - 1);
  recomputeStructureGeometryFromConnections();
}

function popAnnotationWithStructureUnlink(): ManualAnnotation | undefined {
  if (MCV_DATA.annotations.length === 0 || MCV_DATA.structure.lines.length === 0) {
    return undefined;
  }
  const removedIndex = MCV_DATA.structure.lines.length - 1;
  const removed = MCV_DATA.annotations.pop();
  MCV_DATA.structure.lines.pop();
  MCV_DATA.structure.lines.forEach((line) => {
    line.from.from = line.from.from.filter((value) => value !== removedIndex);
    line.from.to = line.from.to.filter((value) => value !== removedIndex);
    line.to.from = line.to.from.filter((value) => value !== removedIndex);
    line.to.to = line.to.to.filter((value) => value !== removedIndex);
  });
  recomputeStructureGeometryFromConnections();
  return removed;
}

function rebuildStructureFromAnnotations(): void {
  const annotations = MCV_DATA.annotations;
  MCV_DATA.structure.lines = annotations.map((line) => createStructureLineFromAnnotation(line));
  for (let i = 0; i < MCV_DATA.structure.lines.length; i += 1) {
    linkLineIndexAgainstOthers(i);
  }
  recomputeStructureGeometryFromConnections();
}

function resetCropInteractionState(): void {
  MCV_DATA.annotations.length = 0;
  MCV_DATA.structure.lines.length = 0;
  manualRedoLines.length = 0;
  manualDraftLine = null;
  manualDragPointerId = null;
  manualDragClientX = 0;
  manualDragClientY = 0;
  manualAxisStartsBackwards = false;
  renderAnnotationPreviewHeld = false;
}

function isThenable(value: unknown): value is Promise<unknown> {
  return typeof value === "object" && value !== null && "then" in value;
}

function loadScriptOnce(scriptUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-mcv-src="${scriptUrl}"]`) as
      | HTMLScriptElement
      | null;
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${scriptUrl}`)), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.dataset.mcvSrc = scriptUrl;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "1";
        resolve();
      },
      { once: true }
    );
    script.addEventListener("error", () => reject(new Error(`Failed to load ${scriptUrl}`)), {
      once: true,
    });
    document.head.appendChild(script);
  });
}

async function getWebMcvRuntime(): Promise<any> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const maybeGlobalCv = (globalThis as any).cv;
      if (!maybeGlobalCv) {
        await loadScriptOnce(__MCV_OPENCV_URL__);
      }
      const cvCandidate = (globalThis as any).cv;
      if (!cvCandidate) {
        throw new Error("opencv.js runtime not found on window.cv");
      }
      if (typeof cvCandidate === "function") {
        return await cvCandidate();
      }
      if (isThenable(cvCandidate)) {
        return await cvCandidate;
      }
      return cvCandidate;
    })();
  }
  return cvPromise;
}

async function decodeImageDataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  return await new Promise<HTMLCanvasElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (width <= 0 || height <= 0) {
        reject(new Error("Decoded image has invalid dimensions"));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas);
    };
    image.onerror = () => {
      reject(new Error("Failed to decode image_data_url"));
    };
    image.src = dataUrl;
  });
}

function grayArrayToPngDataUrl(gray: Uint8Array, width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context unavailable");
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    const value = gray[i];
    rgba[p] = value;
    rgba[p + 1] = value;
    rgba[p + 2] = value;
    rgba[p + 3] = 255;
  }
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas.toDataURL("image/png");
}

function decodeLineSegmentsFromMat(linesMat: any): McvLineSegment[] {
  if (!linesMat || typeof linesMat.rows !== "number" || linesMat.rows <= 0) {
    return [];
  }
  const data = linesMat.data32F as Float32Array | undefined;
  if (!data || data.length < 4) {
    return [];
  }
  const segments: McvLineSegment[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    segments.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
  }
  return segments;
}

function detectLineSegmentsWeb(cv: any, grayMat: any): McvLineSegment[] {
  let lsd: any = null;
  let linesMat: any = null;
  let widthsMat: any = null;
  let precisionsMat: any = null;
  let nfasMat: any = null;
  try {
    try {
      lsd = cv.createLineSegmentDetector(cv.LSD_REFINE_STD ?? 1);
    } catch {
      lsd = cv.createLineSegmentDetector();
    }
    linesMat = new cv.Mat();
    widthsMat = new cv.Mat();
    precisionsMat = new cv.Mat();
    nfasMat = new cv.Mat();
    // OpenCV.js binding requires explicit output mats for detect(...).
    lsd.detect(grayMat, linesMat, widthsMat, precisionsMat, nfasMat);
    return decodeLineSegmentsFromMat(linesMat);
  } finally {
    if (nfasMat && typeof nfasMat.delete === "function") {
      nfasMat.delete();
    }
    if (precisionsMat && typeof precisionsMat.delete === "function") {
      precisionsMat.delete();
    }
    if (widthsMat && typeof widthsMat.delete === "function") {
      widthsMat.delete();
    }
    if (linesMat && typeof linesMat.delete === "function") {
      linesMat.delete();
    }
    if (lsd && typeof lsd.delete === "function") {
      lsd.delete();
    }
  }
}

async function runWebImagePipeline(
  args: McvImagePipelineArgs
): Promise<McvImagePipelineResult> {
  const cv = await getWebMcvRuntime();
  const startedAtMs = performance.now();
  const canvas = await decodeImageDataUrlToCanvas(args.image_data_url);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context unavailable");
  }
  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const src = imageData.data;

  const gray = new Uint8Array(width * height);
  for (let srcIndex = 0, dstIndex = 0; srcIndex < src.length; srcIndex += 4, dstIndex += 1) {
    gray[dstIndex] = Math.round((src[srcIndex] + src[srcIndex + 1] + src[srcIndex + 2]) / 3);
  }

  let grayMat: any = null;
  let lineSegments: McvLineSegment[] = [];
  try {
    grayMat = new cv.Mat(height, width, cv.CV_8UC1);
    grayMat.data.set(gray);
    lineSegments = detectLineSegmentsWeb(cv, grayMat);
  } finally {
    if (grayMat) {
      grayMat.delete();
    }
  }

  return {
    grayscale_image_data_url: grayArrayToPngDataUrl(gray, width, height),
    line_segments: lineSegments,
    width,
    height,
    duration_ms: Math.max(0, Math.round(performance.now() - startedAtMs)),
  };
}

async function runPythonImagePipeline(
  args: McvImagePipelineArgs
): Promise<McvImagePipelineResult> {
  const response = await fetch("/api/mcv/pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ args }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as McvImagePipelineHttpResponse;
  if (!payload.ok || !payload.data) {
    const message = payload.error?.message || "Pipeline failed";
    throw new Error(message);
  }
  return payload.data;
}

async function runImagePipeline(args: McvImagePipelineArgs): Promise<McvImagePipelineResult> {
  if (!args || typeof args.image_data_url !== "string" || !args.image_data_url.trim()) {
    throw new Error("image_data_url is required");
  }

  if (__MCV_BACKEND__ === "web") {
    return await runWebImagePipeline(args);
  }

  return await runPythonImagePipeline(args);
}

async function callMcvApi<TData>(requestBody: McvRequest): Promise<McvResponse<TData>> {
  if (__MCV_BACKEND__ === "web") {
    if (requestBody.op !== "cv.opencvTest") {
      return {
        ok: false,
        error: {
          code: "UNKNOWN_OP",
          message: `Unsupported operation in web backend: ${requestBody.op}`,
        },
      };
    }

    try {
      const cv = await getWebMcvRuntime();
      const src = cv.matFromArray(1, 3, cv.CV_8UC3, [255, 0, 0, 0, 255, 0, 0, 0, 255]);
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGB2GRAY);
      const grayValues = Array.from(gray.data as Uint8Array).map((value) => Number(value));
      const response = {
        ok: true,
        data: {
          opencv_version: String((cv as any).VERSION ?? "opencv.js"),
          gray_values: grayValues,
          shape: [Number(gray.rows), Number(gray.cols)],
          mean_gray:
            grayValues.length > 0
              ? grayValues.reduce((sum, value) => sum + value, 0) / grayValues.length
              : 0,
        },
      } satisfies McvSuccess<McvOpencvTestResult>;
      src.delete();
      gray.delete();
      return response as McvResponse<TData>;
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "WEB_BACKEND_ERROR",
          message: "OpenCV.js call failed",
          details: String(error),
        },
      };
    }
  }

  try {
    const response = await fetch("/api/mcv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: "HTTP_ERROR",
          message: `HTTP ${response.status}`,
        },
      };
    }

    return (await response.json()) as McvResponse<TData>;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: "Could not reach backend API",
        details: String(error),
      },
    };
  }
}

async function fetchMediaApi(): Promise<Response> {
  return fetch(__MCV_MEDIA_API_URL__);
}

function isMediaApiAvailable(): boolean {
  return typeof __MCV_MEDIA_API_URL__ === "string" && __MCV_MEDIA_API_URL__.trim().length > 0;
}

function isDataApiAvailable(): boolean {
  return typeof __MCV_DATA_API_URL__ === "string" && __MCV_DATA_API_URL__.trim().length > 0;
}

function installGlobalApi(): void {
  window.MCV_API = {
    media: {
      url: __MCV_MEDIA_API_URL__,
      available: isMediaApiAvailable,
      fetch: fetchMediaApi,
    },
    data: {
      url: __MCV_DATA_API_URL__,
      available: isDataApiAvailable,
    },
    mcv: {
      call: callMcvApi,
      runImagePipeline: runImagePipeline,
      backend: __MCV_BACKEND__,
    },
  };
  rebuildStructureFromAnnotations();
  window.MCV_DATA = MCV_DATA;
}

function getMediaBoxNode(): HTMLDivElement | null {
  return document.getElementById("media-box") as HTMLDivElement | null;
}

function getMediaErrorNode(): HTMLDivElement | null {
  return document.getElementById("media-error") as HTMLDivElement | null;
}

function getSelectorScreenNode(): HTMLDivElement | null {
  return document.getElementById("selector-screen") as HTMLDivElement | null;
}

function getViewerScreenNode(): HTMLDivElement | null {
  return document.getElementById("viewer-screen") as HTMLDivElement | null;
}

function getViewerTitleNode(): HTMLHeadingElement | null {
  return document.getElementById("viewer-title") as HTMLHeadingElement | null;
}

function getViewerContentNode(): HTMLDivElement | null {
  return document.getElementById("viewer-content") as HTMLDivElement | null;
}

function getViewerFullImageStageNode(): HTMLElement | null {
  return document.getElementById("viewer-full-image-stage");
}

function getViewerFullImageNode(): HTMLImageElement | null {
  return document.getElementById("viewer-full-image") as HTMLImageElement | null;
}

function getViewerCropResultNode(): HTMLDivElement | null {
  return document.getElementById("viewer-crop-result") as HTMLDivElement | null;
}

function getViewerCropResultSvgNode(): SVGSVGElement | null {
  const cropResultNode = getViewerCropResultNode();
  if (!cropResultNode) {
    return null;
  }
  return cropResultNode.firstElementChild as SVGSVGElement | null;
}

function hideViewerCropResult(): void {
  const cropResultNode = getViewerCropResultNode();
  if (cropResultNode) {
    cropResultNode.replaceChildren();
    cropResultNode.classList.add("hidden");
  }
}

function showViewerCropResult(): void {
  const cropResultNode = getViewerCropResultNode();
  if (!cropResultNode) {
    return;
  }
  cropResultNode.classList.remove("hidden");
}

function updateViewerCursor(): void {
  const cropResultNode = getViewerCropResultNode();
  if (!cropResultNode) {
    return;
  }
  if (viewerInput.grabbed) {
    cropResultNode.style.cursor = "grabbing";
    return;
  }
  cropResultNode.style.cursor = viewerCtrlHeld ? "move" : "crosshair";
}

function engageViewerGrab(pointerId: number): void {
  viewerInput.grabbed = true;
  viewerInput.pointerId = pointerId;
  viewerInput.x = manualDragClientX;
  viewerInput.y = manualDragClientY;
  viewerMotion.velX *= 1 - movement.stop;
  viewerMotion.velY *= 1 - movement.stop;
  updateViewerCursor();
}

function releaseViewerGrab(): void {
  viewerInput.grabbed = false;
  viewerInput.pointerId = null;
  updateViewerCursor();
}

function resetViewerMotionState(): void {
  viewerMotion.x = 0;
  viewerMotion.y = 0;
  viewerMotion.velX = 0;
  viewerMotion.velY = 0;
  viewerMotion.zoom = 1;
  viewerInput.grabbed = false;
  viewerInput.pointerId = null;
}

function applyViewerTransformToSvg(): void {
  const svg = getViewerCropResultSvgNode();
  if (!svg) {
    return;
  }
  const group = svg.querySelector('[data-role="viewer-scene"]') as SVGGElement | null;
  if (!group) {
    return;
  }
  group.setAttribute(
    "transform",
    `translate(${viewerMotion.x} ${viewerMotion.y}) scale(${viewerMotion.zoom})`
  );
}

function stopViewerMotionLoop(): void {
  if (viewerMotionRafId !== null) {
    cancelAnimationFrame(viewerMotionRafId);
    viewerMotionRafId = null;
  }
}

function startViewerMotionLoop(): void {
  if (viewerMotionRafId !== null) {
    return;
  }
  const tick = () => {
    const factor = (viewerInput.grabbed ? movement.slip : 1) * movement.speed;
    viewerMotion.x += viewerMotion.velX * factor;
    viewerMotion.y += viewerMotion.velY * factor;

    const decay = viewerInput.grabbed ? 1 - movement.grip : 1 - movement.friction;
    viewerMotion.velX *= decay;
    viewerMotion.velY *= decay;
    applyViewerTransformToSvg();
    viewerMotionRafId = requestAnimationFrame(tick);
  };
  viewerMotionRafId = requestAnimationFrame(tick);
}

function clearViewerFullImage(): void {
  const stage = getViewerFullImageStageNode();
  const image = getViewerFullImageNode();
  if (image) {
    image.onload = null;
    image.classList.remove("hidden");
    image.removeAttribute("src");
    image.alt = "";
  }
  if (stage) {
    stage.classList.add("hidden");
  }
  resetViewerMotionState();
  stopViewerMotionLoop();
  cropResultCache = null;
  resetCropInteractionState();
  hideViewerCropResult();
}

function scrollViewerFullImageIntoView(): void {
  const stage = getViewerFullImageStageNode();
  if (!stage) {
    return;
  }
  const top = window.scrollY + stage.getBoundingClientRect().top - 8;
  window.scrollTo({
    top: Math.max(0, top),
    behavior: "smooth",
  });
}

function showViewerFullImage(src: string, alt: string): void {
  const stage = getViewerFullImageStageNode();
  const image = getViewerFullImageNode();
  if (!stage || !image) {
    return;
  }
  resetViewerMotionState();
  cropResultCache = null;
  resetCropInteractionState();
  hideViewerCropResult();
  image.crossOrigin = "anonymous";
  image.classList.remove("hidden");
  image.src = src;
  image.alt = alt;
  image.onload = () => {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width > 0 && height > 0) {
      cropResultCache = {
        colorDataUrl: src,
        width,
        height,
      };
      renderCropResultFromCache();
      image.classList.add("hidden");
      startViewerMotionLoop();
      updateViewerCursor();
    }
    scrollViewerFullImageIntoView();
  };
  stage.classList.remove("hidden");
  requestAnimationFrame(scrollViewerFullImageIntoView);
  window.setTimeout(scrollViewerFullImageIntoView, 60);
}

function createCropResultSvgBase(width: number, height: number, imageDataUrl: string): SVGSVGElement {
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.classList.add("viewer-crop-result-svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  const imageNode = document.createElementNS(svgNs, "image");
  imageNode.setAttribute("href", imageDataUrl);
  imageNode.setAttribute("x", "0");
  imageNode.setAttribute("y", "0");
  imageNode.setAttribute("width", String(width));
  imageNode.setAttribute("height", String(height));
  imageNode.setAttribute("preserveAspectRatio", "none");
  const sceneGroup = document.createElementNS(svgNs, "g");
  sceneGroup.setAttribute("data-role", "viewer-scene");
  sceneGroup.appendChild(imageNode);
  svg.appendChild(sceneGroup);
  return svg;
}

function appendSvgLine(
  parent: SVGElement,
  segment: McvLineSegment,
  stroke: string,
  strokeWidth = 1,
  opacity = 1,
  markerEndId?: string
): void {
  const svgNs = "http://www.w3.org/2000/svg";
  const line = document.createElementNS(svgNs, "line");
  line.setAttribute("x1", String(segment[0]));
  line.setAttribute("y1", String(segment[1]));
  line.setAttribute("x2", String(segment[2]));
  line.setAttribute("y2", String(segment[3]));
  line.setAttribute("stroke", stroke);
  line.setAttribute("stroke-width", String(strokeWidth));
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("vector-effect", "non-scaling-stroke");
  line.setAttribute("opacity", String(opacity));
  if (markerEndId) {
    line.setAttribute("marker-end", `url(#${markerEndId})`);
  }
  parent.appendChild(line);
}

function appendSvgLineLabel(
  parent: SVGElement,
  segment: McvLineSegment,
  textValue: number | undefined,
  color: string
): void {
  if (textValue === undefined || textValue <= 0) {
    return;
  }
  const svgNs = "http://www.w3.org/2000/svg";
  const text = document.createElementNS(svgNs, "text");
  const midX = (segment[0] + segment[2]) * 0.5;
  const midY = (segment[1] + segment[3]) * 0.5;
  text.setAttribute("x", String(midX + 4));
  text.setAttribute("y", String(midY - 4));
  text.setAttribute("fill", color);
  text.setAttribute("stroke", "#111821");
  text.setAttribute("stroke-width", "0.6");
  text.setAttribute("paint-order", "stroke fill");
  text.setAttribute("font-size", "8");
  text.setAttribute("font-weight", "700");
  text.setAttribute("font-family", "Segoe UI, Tahoma, sans-serif");
  text.setAttribute("vector-effect", "non-scaling-stroke");
  text.textContent = String(textValue);
  parent.appendChild(text);
}

function adjustDraftEdgeLength(delta: number): void {
  if (!manualDraftLine) {
    return;
  }
  const current = manualDraftLine.length ?? 0;
  const next = Math.max(0, current + delta);
  manualDraftLine =
    next > 0
      ? {
          ...manualDraftLine,
          length: next,
        }
      : {
          from: manualDraftLine.from,
          to: manualDraftLine.to,
          axis: manualDraftLine.axis,
          flipped: manualDraftLine.flipped,
        };
  renderCropResultFromCache();
}

function getLineSegmentForLine(line: { from: ManualPoint; to: ManualPoint }): McvLineSegment {
  return [line.from.x, line.from.y, line.to.x, line.to.y];
}

function getLineSegmentForDraft(draft: DraftManualLine): McvLineSegment {
  const from = draft.flipped ? draft.to : draft.from;
  const to = draft.flipped ? draft.from : draft.to;
  return [from.x, from.y, to.x, to.y];
}

function getAxisColor(axis: ManualAxis): string {
  if (axis === "x") {
    return "#ff4d4d";
  }
  if (axis === "y") {
    return "#5dff74";
  }
  return "#4da1ff";
}

function getAxisLightColor(axis: ManualAxis): string {
  if (axis === "x") {
    return "#ff9a9a";
  }
  if (axis === "y") {
    return "#a6ffb3";
  }
  return "#9ec7ff";
}

function getAxisMarkerId(axis: ManualAxis): string {
  return `mcv-arrow-${axis}`;
}

function appendAxisMarkers(svg: SVGSVGElement): void {
  const svgNs = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(svgNs, "defs");
  (["x", "y", "z"] as ManualAxis[]).forEach((axis) => {
    const marker = document.createElementNS(svgNs, "marker");
    marker.setAttribute("id", getAxisMarkerId(axis));
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX", "7");
    marker.setAttribute("refY", "4");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "strokeWidth");
    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("d", "M 0 0 L 8 4 L 0 8 z");
    path.setAttribute("fill", getAxisColor(axis));
    marker.appendChild(path);
    defs.appendChild(marker);
  });
  svg.appendChild(defs);
}

function getCropViewPointFromClient(
  clientX: number,
  clientY: number,
  width: number,
  height: number
): { x: number; y: number } | null {
  const cropResultNode = getViewerCropResultNode();
  const displayNode = cropResultNode?.firstElementChild as
    | (Element & { getBoundingClientRect: () => DOMRect })
    | null;
  if (!displayNode) {
    return null;
  }
  const rect = displayNode.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * width,
    y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) * height,
  };
}

function getCropPointFromClient(
  clientX: number,
  clientY: number,
  width: number,
  height: number
): { x: number; y: number } | null {
  const viewPoint = getCropViewPointFromClient(clientX, clientY, width, height);
  if (!viewPoint) {
    return null;
  }
  return {
    x: (viewPoint.x - viewerMotion.x) / viewerMotion.zoom,
    y: (viewPoint.y - viewerMotion.y) / viewerMotion.zoom,
  };
}

function getDraftAsAnnotation(draft: DraftManualLine): ManualAnnotation {
  const from = draft.flipped ? draft.to : draft.from;
  const to = draft.flipped ? draft.from : draft.to;
  return {
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    axis: draft.axis,
    ...(draft.length !== undefined && draft.length > 0 ? { length: draft.length } : {}),
  };
}

function annotationsWouldLink(first: ManualAnnotation, second: ManualAnnotation, threshold: number): boolean {
  if (first.axis === second.axis) {
    return false;
  }
  const firstPoints = [first.from, first.to];
  const secondPoints = [second.from, second.to];
  for (const firstPoint of firstPoints) {
    for (const secondPoint of secondPoints) {
      const distance = Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y);
      if (distance <= threshold) {
        return true;
      }
    }
  }
  return false;
}

function getDraftPotentialLinkIndexes(draft: DraftManualLine): Set<number> {
  const potential = new Set<number>();
  const draftAnnotation = getDraftAsAnnotation(draft);
  const threshold = computeStructureLinkThreshold([...MCV_DATA.annotations, draftAnnotation]);
  for (let index = 0; index < MCV_DATA.annotations.length; index += 1) {
    if (annotationsWouldLink(draftAnnotation, MCV_DATA.annotations[index], threshold)) {
      potential.add(index);
    }
  }
  return potential;
}

function createManualModeCropResultSvg(
  width: number,
  height: number,
  colorDataUrl: string
): SVGSVGElement {
  const svg = createCropResultSvgBase(width, height, colorDataUrl);
  appendAxisMarkers(svg);
  const sceneGroup = svg.querySelector('[data-role="viewer-scene"]') as SVGGElement | null;
  if (!sceneGroup) {
    return svg;
  }

  const potentialLinkIndexes = manualDraftLine ? getDraftPotentialLinkIndexes(manualDraftLine) : new Set<number>();
  const linesToRender: Array<ManualAnnotation | StructureLine> = renderAnnotationPreviewHeld
    ? MCV_DATA.annotations
    : MCV_DATA.structure.lines;
  linesToRender.forEach((line, index) => {
    const axisColor = potentialLinkIndexes.has(index) ? getAxisLightColor(line.axis) : getAxisColor(line.axis);
    const segment = getLineSegmentForLine(line);
    appendSvgLine(
      sceneGroup,
      segment,
      axisColor,
      2,
      1,
      getAxisMarkerId(line.axis)
    );
    appendSvgLineLabel(sceneGroup, segment, line.length, axisColor);
  });
  if (manualDraftLine) {
    const draftSegment = getLineSegmentForDraft(manualDraftLine);
    const axisColor = getAxisColor(manualDraftLine.axis);
    appendSvgLine(
      sceneGroup,
      draftSegment,
      axisColor,
      2,
      0.95,
      getAxisMarkerId(manualDraftLine.axis)
    );
    appendSvgLineLabel(sceneGroup, draftSegment, manualDraftLine.length, axisColor);
  }

  svg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !cropResultCache) {
      return;
    }
    if (event.ctrlKey || viewerCtrlHeld) {
      manualDragClientX = event.clientX;
      manualDragClientY = event.clientY;
      engageViewerGrab(event.pointerId);
      event.preventDefault();
      return;
    }

    const point = getCropPointFromClient(event.clientX, event.clientY, cropResultCache.width, cropResultCache.height);
    if (!point) {
      return;
    }
    manualDraftLine = {
      from: { x: point.x, y: point.y },
      to: { x: point.x, y: point.y },
      axis: manualAxisSelection,
      flipped: manualAxisStartsBackwards,
    };
    manualDragPointerId = event.pointerId;
    manualDragClientX = event.clientX;
    manualDragClientY = event.clientY;
    event.preventDefault();
    renderCropResultFromCache();
  });

  svg.addEventListener("wheel", (event) => {
    if (!cropResultCache || !(event.ctrlKey || viewerCtrlHeld)) {
      return;
    }
    const viewPoint = getCropViewPointFromClient(
      event.clientX,
      event.clientY,
      cropResultCache.width,
      cropResultCache.height
    );
    if (!viewPoint) {
      return;
    }
    event.preventDefault();

    const zoomFactor = (1 + movement.zoomSpeed) ** -event.deltaY;
    const nextZoom = viewerMotion.zoom * zoomFactor;
    const imageX = (viewPoint.x - viewerMotion.x) / viewerMotion.zoom;
    const imageY = (viewPoint.y - viewerMotion.y) / viewerMotion.zoom;
    viewerMotion.x = viewPoint.x - imageX * nextZoom;
    viewerMotion.y = viewPoint.y - imageY * nextZoom;
    viewerMotion.zoom = nextZoom;
    applyViewerTransformToSvg();
  });

  svg.addEventListener("contextmenu", (event) => {
    if (!cropResultCache || event.ctrlKey || viewerCtrlHeld) {
      return;
    }
    event.preventDefault();
    adjustDraftEdgeLength(1);
  });

  applyViewerTransformToSvg();
  updateViewerCursor();

  return svg;
}

function sizeCropResultElement(
  element: Element & { style: CSSStyleDeclaration },
  width: number,
  height: number
): void {
  const stage = getViewerFullImageStageNode();
  const stageRect = stage?.getBoundingClientRect();
  const availableWidth = Math.max(120, window.innerWidth - 24);
  const viewportTop = stageRect ? Math.max(0, stageRect.top) : 0;
  const availableHeight = Math.max(120, window.innerHeight - viewportTop - 12);
  const scale = Math.max(0.01, Math.min(availableWidth / width, availableHeight / height));
  element.style.width = `${Math.floor(width * scale)}px`;
  element.style.height = `${Math.floor(height * scale)}px`;
}

function renderCropResultFromCache(): void {
  if (!cropResultCache) {
    return;
  }
  const cropResultNode = getViewerCropResultNode();
  if (!cropResultNode) {
    return;
  }

  const svg = createManualModeCropResultSvg(
    cropResultCache.width,
    cropResultCache.height,
    cropResultCache.colorDataUrl
  );
  sizeCropResultElement(svg, cropResultCache.width, cropResultCache.height);
  cropResultNode.replaceChildren(svg);
  showViewerCropResult();
}

function updateManualDraftFromPointer(pointer: PointerEvent): void {
  if (
    viewerInput.grabbed &&
    viewerInput.pointerId !== null &&
    pointer.pointerId === viewerInput.pointerId
  ) {
    manualDragClientX = pointer.clientX;
    manualDragClientY = pointer.clientY;
    const dxClient = pointer.clientX - viewerInput.x;
    const dyClient = pointer.clientY - viewerInput.y;
    viewerInput.x = pointer.clientX;
    viewerInput.y = pointer.clientY;
    if (cropResultCache) {
      const svg = getViewerCropResultSvgNode();
      const rect = svg?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        const dx = dxClient * (cropResultCache.width / rect.width);
        const dy = dyClient * (cropResultCache.height / rect.height);
        const factor = movement.speed * (1 - movement.slip);
        viewerMotion.x += dx * factor;
        viewerMotion.y += dy * factor;
        viewerMotion.velX = dx + viewerMotion.velX * movement.buildup;
        viewerMotion.velY = dy + viewerMotion.velY * movement.buildup;
        applyViewerTransformToSvg();
      }
    }
    return;
  }

  if (
    !cropResultCache ||
    manualDragPointerId === null ||
    pointer.pointerId !== manualDragPointerId ||
    !manualDraftLine
  ) {
    return;
  }
  manualDragClientX = pointer.clientX;
  manualDragClientY = pointer.clientY;
  const point = getCropPointFromClient(
    pointer.clientX,
    pointer.clientY,
    cropResultCache.width,
    cropResultCache.height
  );
  if (!point) {
    return;
  }
  manualDraftLine = {
    ...manualDraftLine,
    to: {
      x: point.x,
      y: point.y,
    },
  };
  renderCropResultFromCache();
}

function finalizeManualDraftFromPointer(pointer: PointerEvent): void {
  if (
    viewerInput.grabbed &&
    viewerInput.pointerId !== null &&
    pointer.pointerId === viewerInput.pointerId
  ) {
    manualDragClientX = pointer.clientX;
    manualDragClientY = pointer.clientY;
    releaseViewerGrab();
    if (manualDragPointerId === null || pointer.pointerId !== manualDragPointerId) {
      return;
    }
  }

  if (
    !cropResultCache ||
    manualDragPointerId === null ||
    pointer.pointerId !== manualDragPointerId
  ) {
    return;
  }
  manualDragPointerId = null;
  if (!manualDraftLine) {
    return;
  }
  const point = getCropPointFromClient(
    pointer.clientX,
    pointer.clientY,
    cropResultCache.width,
    cropResultCache.height
  );
  const updatedDraft: DraftManualLine = point
    ? {
        ...manualDraftLine,
        to: { x: point.x, y: point.y },
      }
    : manualDraftLine;
  const committedFrom = updatedDraft.flipped ? updatedDraft.to : updatedDraft.from;
  const committedTo = updatedDraft.flipped ? updatedDraft.from : updatedDraft.to;
  const committedAxis = updatedDraft.axis;
  const committedLength = updatedDraft.length;
  manualDraftLine = null;

  const length = Math.hypot(
    committedTo.x - committedFrom.x,
    committedTo.y - committedFrom.y
  );
  if (length >= 2) {
    pushAnnotationWithStructureLink({
      from: committedFrom,
      to: committedTo,
      axis: committedAxis,
      ...(committedLength !== undefined && committedLength > 0 ? { length: committedLength } : {}),
    });
    manualRedoLines.length = 0;
  }
  renderCropResultFromCache();
}

function setMediaError(message: string): void {
  const errorNode = getMediaErrorNode();
  if (!errorNode) {
    return;
  }
  errorNode.textContent = message;
}

function clearMediaError(): void {
  setMediaError("");
}

function setMediaMessage(message: string): void {
  const mediaBoxNode = getMediaBoxNode();
  if (!mediaBoxNode) {
    return;
  }
  mediaBoxNode.textContent = message;
}

function revokeViewerObjectUrl(): void {
  if (currentViewerObjectUrl) {
    URL.revokeObjectURL(currentViewerObjectUrl);
    currentViewerObjectUrl = null;
  }
}

function revokeAnalyzedImageObjectUrl(): void {
  if (currentAnalyzedImageObjectUrl) {
    URL.revokeObjectURL(currentAnalyzedImageObjectUrl);
    currentAnalyzedImageObjectUrl = null;
  }
}

function setViewerMode(isViewerVisible: boolean): void {
  const selectorScreen = getSelectorScreenNode();
  const viewerScreen = getViewerScreenNode();
  if (selectorScreen) {
    selectorScreen.classList.toggle("hidden", isViewerVisible);
  }
  if (viewerScreen) {
    viewerScreen.classList.toggle("hidden", !isViewerVisible);
  }
}

function configureExternalLink(node: HTMLAnchorElement, url: string, label: string): void {
  node.className = "media-link";
  node.href = url;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  node.textContent = label;
  node.addEventListener("click", (event) => {
    event.preventDefault();
    window.open(url, "_blank", "noopener,noreferrer");
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeVideos(value: unknown): Record<string, MediaVideoEntry> {
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

function normalizeImages(value: unknown): Record<string, MediaImageEntry> {
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

function parseMediaLibrary(payload: unknown): MediaLibrary | null {
  if (!isRecord(payload)) {
    return null;
  }
  return {
    videos: normalizeVideos(payload.videos),
    images: normalizeImages(payload.images),
  };
}

function parseUrlOrNull(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isYoutubeUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    host === "youtu.be" ||
    host === "www.youtu.be" ||
    host.endsWith("youtube.com")
  );
}

function extractYoutubeId(url: URL): string | null {
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

function parseTimestampSeconds(raw: string): number | null {
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

function formatTimestamp(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(wholeSeconds / 3600);
  const mins = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function extractYoutubeTimestampLabel(url: URL): string | undefined {
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

function findVideoByYoutubeId(youtubeId: string): { id: string; item: MediaVideoEntry } | null {
  for (const [id, item] of Object.entries(mediaLibrary.videos)) {
    if (id === youtubeId || item.youtube_id === youtubeId) {
      return { id, item };
    }
  }
  return null;
}

function findMediaById(id: string): ViewerMedia | null {
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

function parseLaunchSelectionIntent(): LaunchSelectionIntent | null {
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

function buildLaunchSeekInfo(intent: LaunchSelectionIntent): {
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

  const initialSeekSeconds = Math.max(0, parsedT) + frame / VIEWER_FPS;
  const displayFrame = frame % VIEWER_FPS;
  const displaySeconds = Math.max(0, Math.floor(parsedT + Math.floor(frame / VIEWER_FPS)));
  const timestampLabel = `${formatTimestamp(displaySeconds)}|${displayFrame}`;
  return { initialSeekSeconds, timestampLabel };
}

function applyLaunchSelectionIfAny(): void {
  if (!launchSelectionIntent) {
    return;
  }
  const intent = launchSelectionIntent;
  launchSelectionIntent = null;

  let target: ViewerMedia | null = null;
  if (intent.mode === "id") {
    target = findMediaById(intent.value);
    if (!target) {
      setMediaError(NO_MEDIA_ID_ERROR);
      return;
    }
  } else {
    const foundVideo = findVideoByYoutubeId(intent.value);
    if (!foundVideo) {
      setMediaError(NO_YOUTUBE_VIDEO_ERROR);
      return;
    }
    target = {
      tab: "videos",
      id: foundVideo.id,
      kind: "video",
      title: foundVideo.item.name,
      url: foundVideo.item.url,
      youtubeId: foundVideo.item.youtube_id,
    };
  }

  const seekInfo = buildLaunchSeekInfo(intent);
  if (seekInfo.initialSeekSeconds !== undefined) {
    target.initialSeekSeconds = seekInfo.initialSeekSeconds;
  }
  if (seekInfo.timestampLabel) {
    target.timestampLabel = seekInfo.timestampLabel;
  }

  activeMediaTab = target.tab;
  clearMediaError();
  setTabButtonState();
  openViewer(target);
}

function findMediaByNormalizedUrl(normalizedUrl: string): ViewerMedia | null {
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
        return {
          tab,
          id,
          kind: tab === "videos" ? "video" : "image",
          title: item.name,
          url: item.url,
          ...(tab === "videos" && "youtube_id" in item && item.youtube_id
            ? { youtubeId: item.youtube_id }
            : {}),
        };
      }
    }
  }

  return null;
}

function setTabButtonState(): void {
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

function normalizeSearchToken(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeUrlForMatch(url: URL): string {
  const clone = new URL(url.toString());
  clone.hash = "";
  clone.searchParams.delete("t");
  return clone.toString();
}

function parseSearchIntent(rawQuery: string): SearchIntent {
  const query = rawQuery.trim();
  const parsedUrl = parseUrlOrNull(query);
  const youtubeId = parsedUrl && isYoutubeUrl(parsedUrl) ? extractYoutubeId(parsedUrl) : null;
  const normalizedUrl = parsedUrl ? normalizeUrlForMatch(parsedUrl) : null;
  return { query, parsedUrl, youtubeId, normalizedUrl };
}

function normalizePossibleUrl(value: string): string | null {
  const parsed = parseUrlOrNull(value);
  if (!parsed) {
    return null;
  }
  return normalizeUrlForMatch(parsed);
}

function matchesMediaSearch(id: string, item: MediaVideoEntry | MediaImageEntry, tab: MediaTab): boolean {
  const query = normalizeSearchToken(mediaSearchQuery);
  if (!query) {
    return true;
  }

  const intent = parseSearchIntent(mediaSearchQuery);

  if (intent.youtubeId && tab === "videos") {
    const videoItem = item as MediaVideoEntry;
    if (id === intent.youtubeId || videoItem.youtube_id === intent.youtubeId) {
      return true;
    }
  }

  if (intent.normalizedUrl) {
    const itemNormalizedUrl = normalizePossibleUrl(item.url);
    if (itemNormalizedUrl && itemNormalizedUrl === intent.normalizedUrl) {
      return true;
    }
    if (normalizeSearchToken(item.url).includes(query) || query.includes(normalizeSearchToken(item.url))) {
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
  return haystack.some((value) => normalizeSearchToken(value).includes(query));
}

function inferMediaKindFromUrl(url: URL): MediaKind {
  const pathname = url.pathname.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|bmp|svg|avif)$/.test(pathname)) {
    return "image";
  }
  if (/\.(mp4|webm|mov|m4v|ogv|mkv)$/.test(pathname)) {
    return "video";
  }
  return "video";
}

function inferMediaKindFromFile(file: File): MediaKind {
  if (file.type.startsWith("image/")) {
    return "image";
  }
  if (file.type.startsWith("video/")) {
    return "video";
  }
  const fakeUrl = parseUrlOrNull(`https://local.invalid/${encodeURIComponent(file.name)}`);
  return fakeUrl ? inferMediaKindFromUrl(fakeUrl) : "video";
}

function clampVideoTime(video: HTMLVideoElement, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return Math.min(seconds, video.duration);
  }
  return seconds;
}

function syncViewerTimeInputs(force = false): void {
  if (!viewerVideoNode || !viewerHmsInput) {
    return;
  }
  if (!force && viewerEditingField) {
    return;
  }
  const current = Number.isFinite(viewerVideoNode.currentTime) ? viewerVideoNode.currentTime : 0;
  const safe = Math.max(0, current);
  const wholeSeconds = Math.floor(safe);
  const fractional = safe - wholeSeconds;
  const frame = Math.min(VIEWER_FPS - 1, Math.floor(fractional * VIEWER_FPS));
  viewerHmsInput.value = `${formatTimestamp(wholeSeconds)}|${frame}`;
}

function parseFrameSuffix(raw: string): { base: string; frame: number } | null {
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

function seekViewerFromInput(): void {
  if (!viewerVideoNode || !viewerHmsInput) {
    return;
  }
  const rawValue = viewerHmsInput.value;
  const parsedWithFrame = parseFrameSuffix(rawValue);
  if (!parsedWithFrame) {
    return;
  }
  const baseSeconds = parseTimestampSeconds(parsedWithFrame.base);
  if (baseSeconds === null) {
    return;
  }
  const normalizedFrame = Math.min(parsedWithFrame.frame, VIEWER_FPS - 1);
  const targetSeconds = Math.max(0, baseSeconds) + normalizedFrame / VIEWER_FPS;
  viewerVideoNode.currentTime = clampVideoTime(viewerVideoNode, targetSeconds);
}

function getCurrentViewerTimeParts(): { seconds: number; frame: number } {
  if (!viewerVideoNode || !viewerMedia || viewerMedia.kind !== "video") {
    return { seconds: 0, frame: 0 };
  }
  const safeTime = Math.max(0, Number.isFinite(viewerVideoNode.currentTime) ? viewerVideoNode.currentTime : 0);
  const wholeSeconds = Math.floor(safeTime);
  const fractional = safeTime - wholeSeconds;
  const frame = Math.max(0, Math.min(VIEWER_FPS - 1, Math.floor(fractional * VIEWER_FPS + 1e-6)));
  return { seconds: wholeSeconds, frame };
}

function getShareBaseUrl(): URL {
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

function buildViewerShareUrl(): string | null {
  if (!viewerMedia) {
    return null;
  }
  const shareUrl = getShareBaseUrl();
  shareUrl.hash = "";
  shareUrl.search = "";

  const { seconds, frame } = getCurrentViewerTimeParts();
  const preferredId =
    viewerMedia.id && viewerMedia.id !== "raw-url" && viewerMedia.id !== "upload-file"
      ? viewerMedia.id
      : "";
  if (preferredId) {
    shareUrl.searchParams.set("id", preferredId);
  } else if (viewerMedia.youtubeId) {
    shareUrl.searchParams.set("yt", viewerMedia.youtubeId);
  } else {
    return null;
  }
  shareUrl.searchParams.set("t", String(seconds));
  shareUrl.searchParams.set("f", String(frame));
  return shareUrl.toString();
}

async function copyViewerShareLink(copyButton: HTMLButtonElement | null): Promise<void> {
  const originalLabel = copyButton?.textContent || "Copy link";
  const setLabel = (label: string) => {
    if (copyButton) {
      copyButton.textContent = label;
    }
  };
  const resetLabelSoon = () => {
    window.setTimeout(() => {
      setLabel(originalLabel);
    }, 1200);
  };

  const shareUrl = buildViewerShareUrl();
  if (!shareUrl) {
    setLabel("No share ID");
    resetLabelSoon();
    return;
  }

  try {
    await navigator.clipboard.writeText(shareUrl);
    setLabel("Copied");
  } catch {
    setLabel("Copy failed");
  }
  resetLabelSoon();
}

function buildViewerYoutubeUrl(): string | null {
  if (!viewerMedia?.youtubeId) {
    return null;
  }
  const { seconds } = getCurrentViewerTimeParts();
  const ytUrl = new URL("https://www.youtube.com/watch");
  ytUrl.searchParams.set("v", viewerMedia.youtubeId);
  ytUrl.searchParams.set("t", String(seconds));
  return ytUrl.toString();
}

function openViewerInYoutube(): void {
  const ytUrl = buildViewerYoutubeUrl();
  if (!ytUrl) {
    return;
  }
  window.open(ytUrl, "_blank", "noopener,noreferrer");
}

function getAnalyzedFrameTitle(): string {
  const { seconds, frame } = getCurrentViewerTimeParts();
  const sourceTitle = viewerMedia?.title ? ` from ${viewerMedia.title}` : "";
  return `Frame${sourceTitle} @ ${formatTimestamp(seconds)}|${frame}`;
}

async function captureViewerFrameObjectUrl(): Promise<string> {
  if (!viewerVideoNode) {
    throw new Error("No active video");
  }
  const width = Math.floor(viewerVideoNode.videoWidth);
  const height = Math.floor(viewerVideoNode.videoHeight);
  if (width <= 0 || height <= 0) {
    throw new Error("Video metadata is not ready yet");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context unavailable");
  }
  context.drawImage(viewerVideoNode, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (!nextBlob) {
        reject(new Error("Failed to encode frame"));
        return;
      }
      resolve(nextBlob);
    }, "image/png");
  });
  return URL.createObjectURL(blob);
}

async function analyzeViewerFrame(analyzeButton: HTMLButtonElement | null): Promise<void> {
  const originalLabel = analyzeButton?.textContent || "Analyze!";
  const setLabel = (label: string) => {
    if (analyzeButton) {
      analyzeButton.textContent = label;
    }
  };
  const resetLabelSoon = () => {
    window.setTimeout(() => {
      setLabel(originalLabel);
    }, 1600);
  };

  setLabel("Extracting...");
  try {
    const frameObjectUrl = await captureViewerFrameObjectUrl();
    revokeAnalyzedImageObjectUrl();
    currentAnalyzedImageObjectUrl = frameObjectUrl;
    showViewerFullImage(frameObjectUrl, getAnalyzedFrameTitle());
    setLabel("Analyze!");
  } catch (error) {
    const name = (error as { name?: string } | null)?.name || "";
    if (name === "SecurityError") {
      setLabel("CORS blocked");
    } else {
      setLabel("Analyze failed");
    }
    resetLabelSoon();
  }
}

function closeViewer(): void {
  viewerMedia = null;
  viewerVideoNode = null;
  viewerHmsInput = null;
  viewerEditingField = null;
  clearViewerFullImage();
  revokeAnalyzedImageObjectUrl();
  revokeViewerObjectUrl();
  setViewerMode(false);
}

function renderViewerScreen(): void {
  if (!viewerMedia) {
    setViewerMode(false);
    return;
  }

  const titleNode = getViewerTitleNode();
  const contentNode = getViewerContentNode();
  if (!titleNode || !contentNode) {
    return;
  }

  titleNode.textContent = viewerMedia.title;
  contentNode.replaceChildren();

  if (viewerMedia.kind === "image") {
    clearMediaError();
    showViewerFullImage(viewerMedia.url, viewerMedia.title);
    setViewerMode(true);
    return;
  }

  clearViewerFullImage();

  const videoNode = document.createElement("video");
  videoNode.className = "viewer-video";
  videoNode.controls = true;
  videoNode.preload = "metadata";
  videoNode.crossOrigin = "anonymous";
  videoNode.src = viewerMedia.url;
  contentNode.appendChild(videoNode);

  const controlsNode = document.createElement("div");
  controlsNode.className = "time-controls";

  const hmsRow = document.createElement("div");
  hmsRow.className = "time-row";
  const hmsLabel = document.createElement("div");
  hmsLabel.className = "time-label";
  hmsLabel.textContent = "HH:MM:SS|F";
  const hmsInput = document.createElement("input");
  hmsInput.className = "time-input";
  hmsInput.type = "text";
  hmsInput.placeholder = "00:00:00|0";
  const hmsInputRow = document.createElement("div");
  hmsInputRow.className = "time-input-row";
  hmsInputRow.appendChild(hmsInput);

  const copyLinkButton = document.createElement("button");
  copyLinkButton.type = "button";
  copyLinkButton.className = "viewer-action-button";
  copyLinkButton.textContent = "Copy link";
  copyLinkButton.addEventListener("click", () => {
    void copyViewerShareLink(copyLinkButton);
  });
  hmsInputRow.appendChild(copyLinkButton);

  if (viewerMedia.youtubeId) {
    const openInYtButton = document.createElement("button");
    openInYtButton.type = "button";
    openInYtButton.className = "viewer-action-button";
    openInYtButton.textContent = "Open in YT";
    openInYtButton.addEventListener("click", () => {
      openViewerInYoutube();
    });
    hmsInputRow.appendChild(openInYtButton);
  }

  const analyzeButton = document.createElement("button");
  analyzeButton.type = "button";
  analyzeButton.className = "viewer-action-button accent";
  analyzeButton.textContent = "Analyze!";
  analyzeButton.addEventListener("click", () => {
    void analyzeViewerFrame(analyzeButton);
  });
  hmsInputRow.appendChild(analyzeButton);

  hmsRow.appendChild(hmsLabel);
  hmsRow.appendChild(hmsInputRow);

  controlsNode.appendChild(hmsRow);
  contentNode.appendChild(controlsNode);

  viewerVideoNode = videoNode;
  viewerHmsInput = hmsInput;
  viewerEditingField = null;

  const commitAndSync = () => {
    seekViewerFromInput();
    viewerEditingField = null;
    syncViewerTimeInputs(true);
  };

  hmsInput.addEventListener("focus", () => {
    viewerEditingField = "hms";
  });

  hmsInput.addEventListener("blur", () => {
    commitAndSync();
  });

  hmsInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    commitAndSync();
    hmsInput.blur();
  });

  const updateEvents: Array<keyof HTMLMediaElementEventMap> = [
    "loadedmetadata",
    "timeupdate",
    "seeking",
    "seeked",
    "play",
    "pause",
  ];
  updateEvents.forEach((eventName) => {
    videoNode.addEventListener(eventName, () => {
      syncViewerTimeInputs(false);
    });
  });

  videoNode.addEventListener("loadedmetadata", () => {
    if (!viewerMedia || viewerVideoNode !== videoNode) {
      return;
    }
    if (viewerMedia.initialSeekSeconds !== undefined) {
      videoNode.currentTime = clampVideoTime(videoNode, viewerMedia.initialSeekSeconds);
      viewerMedia.initialSeekSeconds = undefined;
    }
    syncViewerTimeInputs(true);
  });

  syncViewerTimeInputs(true);
  setViewerMode(true);
}

function openViewer(nextViewer: ViewerMedia): void {
  revokeAnalyzedImageObjectUrl();
  if (nextViewer.isObjectUrl) {
    revokeViewerObjectUrl();
    currentViewerObjectUrl = nextViewer.url;
  } else {
    revokeViewerObjectUrl();
  }
  viewerMedia = nextViewer;
  renderViewerScreen();
}

function renderMediaList(): void {
  const mediaBoxNode = getMediaBoxNode();
  if (!mediaBoxNode) {
    return;
  }
  const rawMediaEntries =
    activeMediaTab === "videos"
      ? Object.entries(mediaLibrary.videos)
      : Object.entries(mediaLibrary.images);
  const mediaEntries =
    activeMediaTab === "videos"
      ? rawMediaEntries.filter(([id, item]) => matchesMediaSearch(id, item, "videos"))
      : rawMediaEntries.filter(([id, item]) => matchesMediaSearch(id, item, "images"));

  if (mediaEntries.length === 0) {
    const hasQuery = normalizeSearchToken(mediaSearchQuery).length > 0;
    if (hasQuery) {
      setMediaMessage(activeMediaTab === "videos" ? "No matching videos found." : "No matching images found.");
      return;
    }
    setMediaMessage(activeMediaTab === "videos" ? "No videos found." : "No images found.");
    return;
  }

  const listNode = document.createElement("ul");
  listNode.className = "media-list";

  for (const [id, item] of mediaEntries) {
    const listItemNode = document.createElement("li");
    listItemNode.className = "media-item";

    const titleNode = document.createElement("button");
    titleNode.type = "button";
    titleNode.className = "media-title-button";
    titleNode.textContent = item.name;
    titleNode.addEventListener("click", () => {
      clearMediaError();
      openViewer({
        tab: activeMediaTab,
        id,
        kind: activeMediaTab === "videos" ? "video" : "image",
        title: item.name,
        url: item.url,
        ...(activeMediaTab === "videos" && "youtube_id" in item && item.youtube_id
          ? { youtubeId: item.youtube_id }
          : {}),
      });
    });

    const metaNode = document.createElement("div");
    metaNode.className = "media-meta";
    metaNode.textContent = id;
    if (activeMediaTab === "videos" && "youtube_id" in item && item.youtube_id) {
      const separatorNode = document.createTextNode(" | YouTube: ");
      const youtubeLinkNode = document.createElement("a");
      const youtubeUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(item.youtube_id)}`;
      configureExternalLink(youtubeLinkNode, youtubeUrl, item.youtube_id);
      metaNode.appendChild(separatorNode);
      metaNode.appendChild(youtubeLinkNode);
    }

    const urlNode = document.createElement("a");
    configureExternalLink(urlNode, item.url, item.url);

    listItemNode.appendChild(titleNode);
    listItemNode.appendChild(metaNode);
    listItemNode.appendChild(urlNode);
    listNode.appendChild(listItemNode);
  }

  mediaBoxNode.replaceChildren(listNode);
}

function createUploadZoneNode(): HTMLDivElement {
  const zoneNode = document.createElement("div");
  zoneNode.className = "upload-zone";

  const textNode = document.createElement("div");
  textNode.className = "upload-copy";
  textNode.textContent = selectedUploadFilename
    ? `Selected file: ${selectedUploadFilename}`
    : "Drag and drop a file here or click to select";
  zoneNode.appendChild(textNode);

  const fileInput = document.getElementById("upload-file-input") as HTMLInputElement | null;

  zoneNode.addEventListener("click", () => {
    fileInput?.click();
  });
  zoneNode.addEventListener("dragenter", (event) => {
    event.preventDefault();
    zoneNode.classList.add("dragover");
  });
  zoneNode.addEventListener("dragover", (event) => {
    event.preventDefault();
    zoneNode.classList.add("dragover");
  });
  zoneNode.addEventListener("dragleave", (event) => {
    event.preventDefault();
    zoneNode.classList.remove("dragover");
  });
  zoneNode.addEventListener("drop", (event) => {
    event.preventDefault();
    zoneNode.classList.remove("dragover");
    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const file = droppedFiles[0];
      const objectUrl = URL.createObjectURL(file);
      selectedUploadFilename = file.name;
      openViewer({
        tab: "upload",
        id: "upload-file",
        kind: inferMediaKindFromFile(file),
        title: file.name,
        url: objectUrl,
        isObjectUrl: true,
      });
    }
  });

  return zoneNode;
}

function renderMediaBox(): void {
  if (viewerMedia) {
    renderViewerScreen();
    return;
  }
  setViewerMode(false);
  if (activeMediaTab === "upload") {
    const mediaBoxNode = getMediaBoxNode();
    if (!mediaBoxNode) {
      return;
    }
    mediaBoxNode.replaceChildren(createUploadZoneNode());
    return;
  }
  if (mediaLoadState === "no_api") {
    setMediaMessage("No Media API");
    return;
  }
  if (mediaLoadState === "fetching") {
    setMediaMessage("Fetching...");
    return;
  }
  if (mediaLoadState === "failed") {
    setMediaMessage("Failed to fetch Media Library");
    return;
  }
  if (mediaLoadState === "loaded") {
    renderMediaList();
    return;
  }
  setMediaMessage("loading...");
}

function setActiveMediaTab(nextTab: MediaTab): void {
  activeMediaTab = nextTab;
  clearMediaError();
  setTabButtonState();
  setViewerMode(false);
  renderMediaBox();
}

function restoreFullUncroppedImageView(): void {
  if (!cropResultCache) {
    return;
  }
  resetCropInteractionState();
  resetViewerMotionState();
  renderCropResultFromCache();
  clearMediaError();
}

function handleViewerKeybind(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    if (cropResultCache && viewerMedia?.kind === "image" && manualDraftLine) {
      event.preventDefault();
      manualDraftLine = null;
      manualDragPointerId = null;
      renderCropResultFromCache();
    }
    return;
  }

  const target = event.target as HTMLElement | null;
  const targetIsEditable =
    !!target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable);

  if (cropResultCache && viewerMedia?.kind === "image" && !targetIsEditable) {
    if (event.ctrlKey && !event.shiftKey && (event.key === "z" || event.key === "Z")) {
      event.preventDefault();
      if (manualDraftLine) {
        manualDraftLine = null;
        manualDragPointerId = null;
      } else if (MCV_DATA.annotations.length > 0) {
        const removed = popAnnotationWithStructureUnlink();
        if (removed) {
          manualRedoLines.push(removed);
        }
      }
      renderCropResultFromCache();
      return;
    }
    if (event.ctrlKey && !event.shiftKey && (event.key === "y" || event.key === "Y")) {
      event.preventDefault();
      const restored = manualRedoLines.pop();
      if (restored) {
        pushAnnotationWithStructureLink(restored);
      }
      renderCropResultFromCache();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "=" || event.key === "+") {
      event.preventDefault();
      adjustDraftEdgeLength(1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "-" || event.key === "_") {
      event.preventDefault();
      adjustDraftEdgeLength(-1);
      return;
    }

    const applyAxisSelection = (axis: ManualAxis, startsBackwards: boolean) => {
      manualAxisSelection = axis;
      manualAxisStartsBackwards = startsBackwards;
      if (manualDraftLine) {
        manualDraftLine = {
          ...manualDraftLine,
          axis,
          flipped: startsBackwards,
        };
        renderCropResultFromCache();
      }
    };
    if (event.key === "1" || event.code === "Numpad1") {
      applyAxisSelection("x", false);
      event.preventDefault();
      return;
    }
    if (event.key === "2" || event.code === "Numpad2") {
      applyAxisSelection("y", false);
      event.preventDefault();
      return;
    }
    if (event.key === "3" || event.code === "Numpad3") {
      applyAxisSelection("z", false);
      event.preventDefault();
      return;
    }
    if (event.key === "q" || event.key === "Q") {
      applyAxisSelection("x", true);
      event.preventDefault();
      return;
    }
    if (event.key === "w" || event.key === "W") {
      applyAxisSelection("y", true);
      event.preventDefault();
      return;
    }
    if (event.key === "e" || event.key === "E") {
      applyAxisSelection("z", true);
      event.preventDefault();
      return;
    }
    if (event.key === "Tab" && manualDraftLine) {
      event.preventDefault();
      manualDraftLine = {
        ...manualDraftLine,
        flipped: !manualDraftLine.flipped,
      };
      renderCropResultFromCache();
      return;
    }
  }

  if (!viewerVideoNode || !viewerMedia || viewerMedia.kind !== "video") {
    return;
  }
  if (viewerEditingField) {
    return;
  }
  if (targetIsEditable) {
    return;
  }

  let deltaSeconds = 0;
  if (event.key === ",") {
    deltaSeconds = -1 / VIEWER_FPS;
  } else if (event.key === ".") {
    deltaSeconds = 1 / VIEWER_FPS;
  } else if (event.key === "ArrowLeft") {
    deltaSeconds = -5;
  } else if (event.key === "ArrowRight") {
    deltaSeconds = 5;
  } else if (event.key === "j" || event.key === "J") {
    deltaSeconds = -10;
  } else if (event.key === "l" || event.key === "L") {
    deltaSeconds = 10;
  } else {
    return;
  }

  event.preventDefault();
  const current = Number.isFinite(viewerVideoNode.currentTime) ? viewerVideoNode.currentTime : 0;
  viewerVideoNode.currentTime = clampVideoTime(viewerVideoNode, current + deltaSeconds);
  syncViewerTimeInputs(true);
}

function handleSearchEnter(rawInput: string): void {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return;
  }

  const url = parseUrlOrNull(trimmed);
  if (!url) {
    return;
  }

  clearMediaError();

  if (isYoutubeUrl(url)) {
    const youtubeId = extractYoutubeId(url);
    if (!youtubeId) {
      setMediaError(NO_YOUTUBE_VIDEO_ERROR);
      return;
    }
    const foundVideo = findVideoByYoutubeId(youtubeId);
    if (!foundVideo) {
      setMediaError(NO_YOUTUBE_VIDEO_ERROR);
      return;
    }
    activeMediaTab = "videos";
    const timestampLabel = extractYoutubeTimestampLabel(url);
    const initialSeekSeconds = (() => {
      const raw = (url.searchParams.get("t") || "").trim();
      const parsed = parseTimestampSeconds(raw);
      return parsed === null ? undefined : parsed;
    })();
    openViewer({
      tab: "videos",
      id: foundVideo.id,
      kind: "video",
      title: foundVideo.item.name,
      url: foundVideo.item.url,
      youtubeId: foundVideo.item.youtube_id,
      timestampLabel,
      initialSeekSeconds,
    });
    setTabButtonState();
    return;
  }

  const normalizedUrl = normalizeUrlForMatch(url);
  const matchedMedia = findMediaByNormalizedUrl(normalizedUrl);
  if (matchedMedia) {
    activeMediaTab = matchedMedia.tab;
    openViewer(matchedMedia);
    setTabButtonState();
    return;
  }

  const inferredKind = inferMediaKindFromUrl(url);
  activeMediaTab = inferredKind === "image" ? "images" : "videos";
  openViewer({
    tab: activeMediaTab,
    id: "raw-url",
    kind: inferredKind,
    title: url.toString(),
    url: url.toString(),
  });
  setTabButtonState();
}

function installUiHandlers(): void {
  const videosButton = document.getElementById("tab-videos") as HTMLButtonElement | null;
  const imagesButton = document.getElementById("tab-images") as HTMLButtonElement | null;
  const uploadButton = document.getElementById("tab-upload") as HTMLButtonElement | null;
  const viewerBackButton = document.getElementById("viewer-back") as HTMLButtonElement | null;
  const searchInput = document.getElementById("media-search") as HTMLInputElement | null;
  const fileInput = document.getElementById("upload-file-input") as HTMLInputElement | null;
  if (videosButton) {
    videosButton.addEventListener("click", () => {
      setActiveMediaTab("videos");
    });
  }
  if (imagesButton) {
    imagesButton.addEventListener("click", () => {
      setActiveMediaTab("images");
    });
  }
  if (uploadButton) {
    uploadButton.addEventListener("click", () => {
      setActiveMediaTab("upload");
    });
  }
  if (viewerBackButton) {
    viewerBackButton.addEventListener("click", () => {
      closeViewer();
      renderMediaBox();
    });
  }
  document.addEventListener("keydown", handleViewerKeybind);
  document.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    const targetIsEditable =
      !!target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);
    if (event.code === "Backquote" && !targetIsEditable) {
      if (!renderAnnotationPreviewHeld) {
        renderAnnotationPreviewHeld = true;
        if (cropResultCache && viewerMedia?.kind === "image") {
          renderCropResultFromCache();
        }
      }
      return;
    }
    if (event.key === "Control") {
      viewerCtrlHeld = true;
      if (
        manualDragPointerId !== null &&
        !viewerInput.grabbed &&
        manualDraftLine
      ) {
        engageViewerGrab(manualDragPointerId);
      }
      updateViewerCursor();
    }
  });
  document.addEventListener("keyup", (event) => {
    if (event.code === "Backquote") {
      if (renderAnnotationPreviewHeld) {
        renderAnnotationPreviewHeld = false;
        if (cropResultCache && viewerMedia?.kind === "image") {
          renderCropResultFromCache();
        }
      }
      return;
    }
    if (event.key === "Control") {
      viewerCtrlHeld = false;
      if (
        viewerInput.grabbed &&
        manualDragPointerId !== null &&
        viewerInput.pointerId === manualDragPointerId
      ) {
        releaseViewerGrab();
      }
      updateViewerCursor();
    }
  });
  window.addEventListener("blur", () => {
    viewerCtrlHeld = false;
    releaseViewerGrab();
    if (renderAnnotationPreviewHeld) {
      renderAnnotationPreviewHeld = false;
      if (cropResultCache && viewerMedia?.kind === "image") {
        renderCropResultFromCache();
      }
    }
    updateViewerCursor();
  });
  document.addEventListener("pointermove", (event) => {
    updateManualDraftFromPointer(event);
  });
  document.addEventListener("pointerup", (event) => {
    finalizeManualDraftFromPointer(event);
  });
  document.addEventListener("pointercancel", (event) => {
    finalizeManualDraftFromPointer(event);
  });
  window.addEventListener("resize", () => {
    if (!cropResultCache) {
      return;
    }
    renderCropResultFromCache();
  });
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      mediaSearchQuery = searchInput.value;
      clearMediaError();
      renderMediaBox();
    });
    searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      handleSearchEnter(searchInput.value);
    });
  }
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const objectUrl = URL.createObjectURL(file);
        selectedUploadFilename = file.name;
        openViewer({
          tab: "upload",
          id: "upload-file",
          kind: inferMediaKindFromFile(file),
          title: file.name,
          url: objectUrl,
          isObjectUrl: true,
        });
        fileInput.value = "";
      }
    });
  }
}

async function loadMediaLibrary(): Promise<void> {
  if (!isMediaApiAvailable()) {
    mediaLoadState = "no_api";
    renderMediaBox();
    return;
  }

  clearMediaError();
  mediaLoadState = "fetching";
  renderMediaBox();

  try {
    const response = await fetchMediaApi();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const parsed = parseMediaLibrary(await response.json());
    if (!parsed) {
      throw new Error("Invalid media schema");
    }
    mediaLibrary = parsed;
    mediaLoadState = "loaded";
    applyLaunchSelectionIfAny();
    renderMediaBox();
  } catch {
    mediaLoadState = "failed";
    renderMediaBox();
  }
}

function bootstrap(): void {
  launchSelectionIntent = parseLaunchSelectionIntent();
  installGlobalApi();
  installUiHandlers();
  setTabButtonState();
  renderMediaBox();
  void loadMediaLibrary();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
