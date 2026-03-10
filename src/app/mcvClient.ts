import { wrapDegrees180 } from "./geometry";

type McvOperation =
  | "cv.poseSolve"
  | "cv.precomputeSobel"
  | "cv.clearCache"
  | "cv.opopRefineLine"
  | "cv.projectWorldPoints";

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

type ManualAxis = "x" | "y" | "z";

type ManualPoint = {
  x: number;
  y: number;
};

type StructureEndpoint = ManualPoint & {
  from: number[];
  to: number[];
  anchor?: number;
  vertex?: number;
};

type StructureLine = {
  from: StructureEndpoint;
  to: StructureEndpoint;
  axis: ManualAxis;
  length?: number;
};

type StructureVertexData = {
  from: number[];
  to: number[];
  anchor?: number;
  x?: number;
  y?: number;
  z?: number;
};

type McvPoseSolveArgs = {
  width: number;
  height: number;
  lines: StructureLine[];
  vertices: StructureVertexData[];
  initial_vfov_deg?: number;
};

type McvPoseSolveResult = {
  point_count: number;
  inlier_count: number;
  image_width: number;
  image_height: number;
  initial_vfov_deg: number;
  initial_focal_px: number;
  optimized_focal_px: number;
  optimized_hfov_deg: number;
  optimized_vfov_deg: number;
  reprojection_rmse_px: number;
  camera_position: {
    x: number;
    y: number;
    z: number;
  };
  player_position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: {
    yaw: number;
    pitch: number;
  };
  rvec?: [number, number, number];
  tvec?: [number, number, number];
  tp_command: string;
  reprojected_lines?: Array<{
    line_index: number;
    from: { x: number; y: number };
    to: { x: number; y: number };
  }>;
};

type McvProjectWorldPointsArgs = {
  points: Array<{ x: number; y: number; z: number }>;
  width: number;
  height: number;
  focal_px: number;
  rvec: [number, number, number];
  tvec: [number, number, number];
};

type McvProjectWorldPointsResult = {
  points: Array<{ x: number; y: number }>;
};

type McvSobelPrecomputeArgs = {
  image_data_url: string;
  session_id: string;
  cache_key: string;
};

type McvSobelPrecomputeResult = {
  cache_key: string;
  width: number;
  height: number;
  cached: boolean;
  session_id: string;
};

type McvSobelCacheClearResult = {
  cleared: number;
  session_id: string;
};

type McvOpopWhiskerMode = "per_pixel" | "per_line";

type McvOpopSettings = {
  alignmentStrength: number;
  straightnessStrength: number;
  whiskerMode: McvOpopWhiskerMode;
  whiskersPerPixel: number;
  whiskersPerLine: number;
  normalSearchRadiusPx: number;
  iterations: number;
  includeEndpoints?: boolean;
};

type McvOpopExcludeRange = {
  startT: number;
  endT: number;
};

type McvOpopLine = {
  from: ManualPoint;
  to: ManualPoint;
};

type McvOpopRefineLineArgs = {
  session_id: string;
  cache_key: string;
  line: McvOpopLine;
  drag_line?: McvOpopLine;
  exclude_ranges?: Array<{ start_t: number; end_t: number }>;
  settings: McvOpopSettings;
};

type McvOpopRefineLineResult = {
  from: ManualPoint;
  to: ManualPoint;
  points: ManualPoint[];
  whisker_count: number;
};

type PoseCorrespondence = {
  image: [number, number];
  world: [number, number, number];
};

type EndpointWorldAccumulator = {
  x: number;
  y: number;
  z: number;
  count: number;
};

type McvClientConfig = {
  backend: "python" | "web";
  opencvUrl: string;
  mediaApiUrl: string;
  dataApiUrl: string;
};

type McvClientRuntime = {
  callMcvApi: <TData>(requestBody: McvRequest) => Promise<McvResponse<TData>>;
  runPoseSolve: (args: McvPoseSolveArgs) => Promise<McvPoseSolveResult>;
  runProjectWorldPoints: (args: McvProjectWorldPointsArgs) => Promise<McvProjectWorldPointsResult>;
  runOpopRefineLine: (
    imageDataUrl: string,
    line: McvOpopLine,
    settings: McvOpopSettings,
    dragLine?: McvOpopLine,
    excludeRanges?: McvOpopExcludeRange[]
  ) => Promise<McvOpopRefineLineResult>;
  prepareSobelCache: (imageDataUrl: string) => Promise<void>;
  clearSobelCache: (reason?: "viewer_exit" | "unload") => Promise<void>;
  fetchMediaApi: () => Promise<Response>;
  isMediaApiAvailable: () => boolean;
  isDataApiAvailable: () => boolean;
};

type McvWebSobelCacheEntry = {
  width: number;
  height: number;
  gx: Float32Array;
  gy: Float32Array;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

function hashStringFnv1aHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const randomPart = Math.random().toString(36).slice(2);
  return `mcv-${Date.now().toString(36)}-${randomPart}`;
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
      reject(new Error("Failed to decode image data URL"));
    };
    image.src = dataUrl;
  });
}

async function computeColorSobelWeb(
  getWebMcvRuntime: () => Promise<any>,
  imageDataUrl: string
): Promise<McvWebSobelCacheEntry> {
  const cv = await getWebMcvRuntime();
  const canvas = await decodeImageDataUrlToCanvas(imageDataUrl);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context unavailable");
  }
  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixelCount = width * height;

  let rgbaMat: any = null;
  let rgbMat: any = null;
  let channels: any = null;
  try {
    rgbaMat = new cv.Mat(height, width, cv.CV_8UC4);
    rgbaMat.data.set(imageData.data);
    rgbMat = new cv.Mat();
    cv.cvtColor(rgbaMat, rgbMat, cv.COLOR_RGBA2RGB);
    channels = new cv.MatVector();
    cv.split(rgbMat, channels);

    const gx = new Float32Array(pixelCount * 3);
    const gy = new Float32Array(pixelCount * 3);
    for (let channelIndex = 0; channelIndex < 3; channelIndex += 1) {
      let channelMat: any = null;
      let sobelXMat: any = null;
      let sobelYMat: any = null;
      try {
        channelMat = channels.get(channelIndex);
        sobelXMat = new cv.Mat();
        sobelYMat = new cv.Mat();
        cv.Sobel(channelMat, sobelXMat, cv.CV_32F, 1, 0, 3, 1, 0, cv.BORDER_DEFAULT);
        cv.Sobel(channelMat, sobelYMat, cv.CV_32F, 0, 1, 3, 1, 0, cv.BORDER_DEFAULT);

        const dataX = sobelXMat.data32F as Float32Array | undefined;
        const dataY = sobelYMat.data32F as Float32Array | undefined;
        if (!dataX || !dataY || dataX.length < pixelCount || dataY.length < pixelCount) {
          throw new Error("Unexpected Sobel output layout");
        }

        for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
          const outIndex = pixelIndex * 3 + channelIndex;
          gx[outIndex] = Number(dataX[pixelIndex]);
          gy[outIndex] = Number(dataY[pixelIndex]);
        }
      } finally {
        if (sobelYMat && typeof sobelYMat.delete === "function") {
          sobelYMat.delete();
        }
        if (sobelXMat && typeof sobelXMat.delete === "function") {
          sobelXMat.delete();
        }
        if (channelMat && typeof channelMat.delete === "function") {
          channelMat.delete();
        }
      }
    }
    return {
      width,
      height,
      gx,
      gy,
    };
  } finally {
    if (channels && typeof channels.delete === "function") {
      channels.delete();
    }
    if (rgbMat && typeof rgbMat.delete === "function") {
      rgbMat.delete();
    }
    if (rgbaMat && typeof rgbaMat.delete === "function") {
      rgbaMat.delete();
    }
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeOpopExcludeRanges(ranges?: McvOpopExcludeRange[]): McvOpopExcludeRange[] {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return [];
  }
  const normalized = ranges
    .map((range) => {
      if (!range || !Number.isFinite(range.startT) || !Number.isFinite(range.endT)) {
        return null;
      }
      const startT = clampNumber(Math.min(range.startT, range.endT), 0, 1);
      const endT = clampNumber(Math.max(range.startT, range.endT), 0, 1);
      if (!(endT - startT > 1e-6)) {
        return null;
      }
      return {
        startT,
        endT,
      } satisfies McvOpopExcludeRange;
    })
    .filter((range): range is McvOpopExcludeRange => range !== null)
    .sort((first, second) => first.startT - second.startT);
  const merged: McvOpopExcludeRange[] = [];
  normalized.forEach((range) => {
    const previous = merged[merged.length - 1];
    if (!previous || range.startT > previous.endT + 1e-6) {
      merged.push({ startT: range.startT, endT: range.endT });
      return;
    }
    previous.endT = Math.max(previous.endT, range.endT);
  });
  return merged;
}

function isOpopTExcluded(t: number, ranges: McvOpopExcludeRange[]): boolean {
  if (ranges.length === 0) {
    return false;
  }
  for (let i = 0; i < ranges.length; i += 1) {
    const range = ranges[i];
    if (t >= range.startT - 1e-6 && t <= range.endT + 1e-6) {
      return true;
    }
  }
  return false;
}

function computeOpopWhiskerCount(
  lineLength: number,
  settings: McvOpopSettings
): number {
  if (!Number.isFinite(lineLength) || lineLength <= 0) {
    return 0;
  }
  if (settings.whiskerMode === "per_pixel") {
    const pixelsPerWhisker = Math.max(1, Math.round(settings.whiskersPerPixel));
    return Math.max(1, Math.round(lineLength / pixelsPerWhisker));
  }
  return Math.max(1, Math.round(settings.whiskersPerLine));
}

function normalizeVector(x: number, y: number): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (!(mag > 0)) {
    return { x: 1, y: 0 };
  }
  return { x: x / mag, y: y / mag };
}

function fitPrincipalLineDirection(
  points: ManualPoint[],
  fallback: { x: number; y: number }
): { center: ManualPoint; direction: { x: number; y: number } } {
  if (points.length === 0) {
    return {
      center: { x: 0, y: 0 },
      direction: normalizeVector(fallback.x, fallback.y),
    };
  }
  let meanX = 0;
  let meanY = 0;
  points.forEach((point) => {
    meanX += point.x;
    meanY += point.y;
  });
  meanX /= points.length;
  meanY /= points.length;

  if (points.length < 2) {
    return {
      center: { x: meanX, y: meanY },
      direction: normalizeVector(fallback.x, fallback.y),
    };
  }

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  points.forEach((point) => {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  });
  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const term = Math.sqrt(Math.max(0, trace * trace * 0.25 - det));
  const lambda = trace * 0.5 + term;

  let vx = sxy;
  let vy = lambda - sxx;
  if (Math.hypot(vx, vy) < 1e-8) {
    vx = lambda - syy;
    vy = sxy;
  }
  if (Math.hypot(vx, vy) < 1e-8) {
    vx = fallback.x;
    vy = fallback.y;
  }
  const direction = normalizeVector(vx, vy);
  return {
    center: { x: meanX, y: meanY },
    direction,
  };
}

function sampleBilinearChannel(
  entry: McvWebSobelCacheEntry,
  field: Float32Array,
  x: number,
  y: number,
  channel: 0 | 1 | 2
): number {
  const width = entry.width;
  const height = entry.height;
  const sx = clampNumber(x, 0, width - 1);
  const sy = clampNumber(y, 0, height - 1);
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const wx = sx - x0;
  const wy = sy - y0;

  const idx00 = (y0 * width + x0) * 3 + channel;
  const idx10 = (y0 * width + x1) * 3 + channel;
  const idx01 = (y1 * width + x0) * 3 + channel;
  const idx11 = (y1 * width + x1) * 3 + channel;
  const a = field[idx00] * (1 - wx) + field[idx10] * wx;
  const b = field[idx01] * (1 - wx) + field[idx11] * wx;
  return a * (1 - wy) + b * wy;
}

function computeDirectionalEdgeScore(
  entry: McvWebSobelCacheEntry,
  x: number,
  y: number,
  normal: { x: number; y: number },
  tangent: { x: number; y: number }
): number {
  let normalSq = 0;
  let tangentSq = 0;
  for (let channel: 0 | 1 | 2 = 0 as 0 | 1 | 2; channel < 3; channel = (channel + 1) as 0 | 1 | 2) {
    const gx = sampleBilinearChannel(entry, entry.gx, x, y, channel);
    const gy = sampleBilinearChannel(entry, entry.gy, x, y, channel);
    const projNormal = gx * normal.x + gy * normal.y;
    const projTangent = gx * tangent.x + gy * tangent.y;
    normalSq += projNormal * projNormal;
    tangentSq += projTangent * projTangent;
  }
  return Math.sqrt(normalSq) - 0.2 * Math.sqrt(tangentSq);
}

function runWebOpopRefineLine(
  sobelEntry: McvWebSobelCacheEntry,
  line: McvOpopLine,
  settings: McvOpopSettings,
  dragLine?: McvOpopLine,
  excludeRanges?: McvOpopExcludeRange[]
): McvOpopRefineLineResult {
  const ax = Number(line.from?.x);
  const ay = Number(line.from?.y);
  const bx = Number(line.to?.x);
  const by = Number(line.to?.y);
  if (![ax, ay, bx, by].every((value) => Number.isFinite(value))) {
    throw new Error("line.from and line.to must be finite points");
  }
  const dragAx = Number(dragLine?.from?.x);
  const dragAy = Number(dragLine?.from?.y);
  const dragBx = Number(dragLine?.to?.x);
  const dragBy = Number(dragLine?.to?.y);
  const hasDragLine = [dragAx, dragAy, dragBx, dragBy].every((value) => Number.isFinite(value));

  const dx = bx - ax;
  const dy = by - ay;
  const baseLength = Math.hypot(dx, dy);
  if (!(baseLength > 0)) {
    return {
      from: { x: ax, y: ay },
      to: { x: bx, y: by },
      points: [],
      whisker_count: 0,
    };
  }

  const whiskerCount = computeOpopWhiskerCount(baseLength, settings);
  const radius = clampNumber(settings.normalSearchRadiusPx, 0, 256);
  const iterations = Math.max(1, Math.round(clampNumber(settings.iterations, 1, 64)));
  const alignmentGain = clampNumber(settings.alignmentStrength * 0.2, 0, 1.5);
  const straightnessGain = clampNumber(settings.straightnessStrength * 0.12, 0, 1.0);

  const points: ManualPoint[] = [];
  const normalizedExcludeRanges = normalizeOpopExcludeRanges(excludeRanges);
  const includeEndpoints = Boolean(settings.includeEndpoints);
  const baseTs: number[] = [];
  if (whiskerCount <= 1) {
    baseTs.push(includeEndpoints ? 0 : 0.5);
  } else {
    for (let i = 0; i < whiskerCount; i += 1) {
      const t = includeEndpoints
        ? i / (whiskerCount - 1)
        : (i + 1) / (whiskerCount + 1);
      baseTs.push(t);
    }
  }
  const activeTs = baseTs.filter((t) => !isOpopTExcluded(t, normalizedExcludeRanges));
  if (activeTs.length === 0) {
    return {
      from: { x: ax, y: ay },
      to: { x: bx, y: by },
      points: [],
      whisker_count: 0,
    };
  }
  activeTs.forEach((t) => {
    points.push({
      x: ax + dx * t,
      y: ay + dy * t,
    });
  });

  let fallbackDir = normalizeVector(dx, dy);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const dirSource =
      points.length >= 2
        ? normalizeVector(points[points.length - 1].x - points[0].x, points[points.length - 1].y - points[0].y)
        : fallbackDir;
    const tangent = normalizeVector(dirSource.x, dirSource.y);
    const normal = { x: -tangent.y, y: tangent.x };
    fallbackDir = tangent;

    const updatedTargets: ManualPoint[] = [];
    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      const point = points[pointIndex];
      let bestScore = Number.NEGATIVE_INFINITY;
      let bestOffset = 0;
      const maxOffset = Math.floor(radius);
      for (let offsetStep = -maxOffset; offsetStep <= maxOffset; offsetStep += 1) {
        const offset = Number(offsetStep);
        const sampleX = point.x + normal.x * offset;
        const sampleY = point.y + normal.y * offset;
        const score = computeDirectionalEdgeScore(sobelEntry, sampleX, sampleY, normal, tangent);
        if (score > bestScore) {
          bestScore = score;
          bestOffset = offset;
        }
      }
      updatedTargets.push({
        x: point.x + normal.x * bestOffset,
        y: point.y + normal.y * bestOffset,
      });
    }

    if (alignmentGain > 0) {
      for (let i = 0; i < points.length; i += 1) {
        points[i] = {
          x: points[i].x + (updatedTargets[i].x - points[i].x) * alignmentGain,
          y: points[i].y + (updatedTargets[i].y - points[i].y) * alignmentGain,
        };
      }
    }

    if (straightnessGain > 0 && points.length >= 2) {
      const fitted = fitPrincipalLineDirection(points, fallbackDir);
      const lineDir = fitted.direction;
      const cx = fitted.center.x;
      const cy = fitted.center.y;
      for (let i = 0; i < points.length; i += 1) {
        const relX = points[i].x - cx;
        const relY = points[i].y - cy;
        const scalar = relX * lineDir.x + relY * lineDir.y;
        const projectedX = cx + scalar * lineDir.x;
        const projectedY = cy + scalar * lineDir.y;
        points[i] = {
          x: points[i].x + (projectedX - points[i].x) * straightnessGain,
          y: points[i].y + (projectedY - points[i].y) * straightnessGain,
        };
      }
    }
  }

  const finalFit = fitPrincipalLineDirection(points, fallbackDir);
  const lineDir = finalFit.direction;
  // Preserve endpoint span by projecting original drag endpoints onto the fitted line.
  const sourceAx = hasDragLine ? dragAx : ax;
  const sourceAy = hasDragLine ? dragAy : ay;
  const sourceBx = hasDragLine ? dragBx : bx;
  const sourceBy = hasDragLine ? dragBy : by;
  const scalarA = (sourceAx - finalFit.center.x) * lineDir.x + (sourceAy - finalFit.center.y) * lineDir.y;
  const scalarB = (sourceBx - finalFit.center.x) * lineDir.x + (sourceBy - finalFit.center.y) * lineDir.y;
  let fromPoint: ManualPoint = {
    x: finalFit.center.x + lineDir.x * scalarA,
    y: finalFit.center.y + lineDir.y * scalarA,
  };
  let toPoint: ManualPoint = {
    x: finalFit.center.x + lineDir.x * scalarB,
    y: finalFit.center.y + lineDir.y * scalarB,
  };

  const originalDir = { x: dx, y: dy };
  const refinedDir = { x: toPoint.x - fromPoint.x, y: toPoint.y - fromPoint.y };
  if (originalDir.x * refinedDir.x + originalDir.y * refinedDir.y < 0) {
    const swap = fromPoint;
    fromPoint = toPoint;
    toPoint = swap;
  }

  const width = sobelEntry.width;
  const height = sobelEntry.height;
  const clampSamplePoint = (point: ManualPoint): ManualPoint => ({
    x: clampNumber(point.x, 0, Math.max(0, width - 1)),
    y: clampNumber(point.y, 0, Math.max(0, height - 1)),
  });

  return {
    from: {
      x: Number(fromPoint.x),
      y: Number(fromPoint.y),
    },
    to: {
      x: Number(toPoint.x),
      y: Number(toPoint.y),
    },
    points: points.map((point) => clampSamplePoint(point)),
    whisker_count: points.length,
  };
}

export function buildPoseCorrespondencesFromStructure(
  lines: StructureLine[],
  vertices: StructureVertexData[]
): PoseCorrespondence[] {
  const correspondences: PoseCorrespondence[] = [];
  for (const vertex of vertices) {
    if (!isFiniteNumber(vertex.x) || !isFiniteNumber(vertex.y) || !isFiniteNumber(vertex.z)) {
      continue;
    }
    const endpointIds = new Set<number>();
    vertex.from.forEach((lineIndex) => {
      if (Number.isInteger(lineIndex) && lineIndex >= 0 && lineIndex < lines.length) {
        endpointIds.add(lineIndex * 2);
      }
    });
    vertex.to.forEach((lineIndex) => {
      if (Number.isInteger(lineIndex) && lineIndex >= 0 && lineIndex < lines.length) {
        endpointIds.add(lineIndex * 2 + 1);
      }
    });
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    endpointIds.forEach((endpointId) => {
      const lineIndex = Math.floor(endpointId / 2);
      const endpointKey = endpointId % 2 === 0 ? "from" : "to";
      const line = lines[lineIndex];
      if (!line) {
        return;
      }
      const endpoint = line[endpointKey];
      if (!isFiniteNumber(endpoint.x) || !isFiniteNumber(endpoint.y)) {
        return;
      }
      sumX += endpoint.x;
      sumY += endpoint.y;
      count += 1;
    });
    if (count <= 0) {
      continue;
    }
    correspondences.push({
      image: [sumX / count, sumY / count],
      world: [vertex.x, vertex.y, vertex.z],
    });
  }
  return correspondences;
}

function buildEndpointWorldMap(
  lines: StructureLine[],
  vertices: StructureVertexData[]
): Map<number, [number, number, number]> {
  const accum = new Map<number, EndpointWorldAccumulator>();
  const maxLineIndex = lines.length - 1;
  for (const vertex of vertices) {
    if (!isFiniteNumber(vertex.x) || !isFiniteNumber(vertex.y) || !isFiniteNumber(vertex.z)) {
      continue;
    }
    const addSample = (endpointId: number) => {
      const prev = accum.get(endpointId);
      if (prev) {
        prev.x += vertex.x!;
        prev.y += vertex.y!;
        prev.z += vertex.z!;
        prev.count += 1;
      } else {
        accum.set(endpointId, {
          x: vertex.x!,
          y: vertex.y!,
          z: vertex.z!,
          count: 1,
        });
      }
    };
    for (const lineIndex of vertex.from) {
      if (Number.isInteger(lineIndex) && lineIndex >= 0 && lineIndex <= maxLineIndex) {
        addSample(lineIndex * 2);
      }
    }
    for (const lineIndex of vertex.to) {
      if (Number.isInteger(lineIndex) && lineIndex >= 0 && lineIndex <= maxLineIndex) {
        addSample(lineIndex * 2 + 1);
      }
    }
  }

  const out = new Map<number, [number, number, number]>();
  for (const [endpointId, sample] of accum.entries()) {
    if (sample.count <= 0) {
      continue;
    }
    out.set(endpointId, [sample.x / sample.count, sample.y / sample.count, sample.z / sample.count]);
  }
  return out;
}

function buildReprojectedLinesWeb(
  cv: any,
  lines: StructureLine[],
  vertices: StructureVertexData[],
  rvec: [number, number, number],
  tvec: [number, number, number],
  focal: number,
  width: number,
  height: number
): Array<{
  line_index: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}> {
  const endpointWorld = buildEndpointWorldMap(lines, vertices);
  let camera: any = null;
  let dist: any = null;
  let rvecMat: any = null;
  let tvecMat: any = null;
  try {
    camera = cameraMatrixFromFocalWeb(cv, focal, width, height);
    dist = cv.Mat.zeros(4, 1, cv.CV_64FC1);
    rvecMat = cv.matFromArray(3, 1, cv.CV_64FC1, [rvec[0], rvec[1], rvec[2]]);
    tvecMat = cv.matFromArray(3, 1, cv.CV_64FC1, [tvec[0], tvec[1], tvec[2]]);
    const out: Array<{
      line_index: number;
      from: { x: number; y: number };
      to: { x: number; y: number };
    }> = [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const worldA = endpointWorld.get(lineIndex * 2);
      const worldB = endpointWorld.get(lineIndex * 2 + 1);
      if (!worldA || !worldB) {
        continue;
      }
      const dx = worldB[0] - worldA[0];
      const dy = worldB[1] - worldA[1];
      const dz = worldB[2] - worldA[2];
      if (Math.hypot(dx, dy, dz) < 1e-9) {
        continue;
      }
      let objLine: any = null;
      let projLine: any = null;
      try {
        objLine = cv.matFromArray(2, 1, cv.CV_64FC3, [
          worldA[0],
          worldA[1],
          worldA[2],
          worldB[0],
          worldB[1],
          worldB[2],
        ]);
        projLine = new cv.Mat();
        cv.projectPoints(objLine, rvecMat, tvecMat, camera, dist, projLine);
        const data64 = projLine.data64F as Float64Array | undefined;
        const data32 = projLine.data32F as Float32Array | undefined;
        let ax = Number.NaN;
        let ay = Number.NaN;
        let bx = Number.NaN;
        let by = Number.NaN;
        if (data64 && data64.length >= 4) {
          ax = Number(data64[0]);
          ay = Number(data64[1]);
          bx = Number(data64[2]);
          by = Number(data64[3]);
        } else if (data32 && data32.length >= 4) {
          ax = Number(data32[0]);
          ay = Number(data32[1]);
          bx = Number(data32[2]);
          by = Number(data32[3]);
        }
        if (![ax, ay, bx, by].every((value) => Number.isFinite(value))) {
          continue;
        }
        out.push({
          line_index: lineIndex,
          from: { x: ax, y: ay },
          to: { x: bx, y: by },
        });
      } finally {
        if (projLine && typeof projLine.delete === "function") {
          projLine.delete();
        }
        if (objLine && typeof objLine.delete === "function") {
          objLine.delete();
        }
      }
    }
    return out;
  } finally {
    if (tvecMat && typeof tvecMat.delete === "function") {
      tvecMat.delete();
    }
    if (rvecMat && typeof rvecMat.delete === "function") {
      rvecMat.delete();
    }
    if (dist && typeof dist.delete === "function") {
      dist.delete();
    }
    if (camera && typeof camera.delete === "function") {
      camera.delete();
    }
  }
}

function runWebProjectWorldPoints(cv: any, args: McvProjectWorldPointsArgs): McvProjectWorldPointsResult {
  const width = Math.floor(Number(args.width));
  const height = Math.floor(Number(args.height));
  const focal = Number(args.focal_px);
  const rvec = Array.isArray(args.rvec) ? args.rvec : [];
  const tvec = Array.isArray(args.tvec) ? args.tvec : [];
  const points = Array.isArray(args.points) ? args.points : [];
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(focal) ||
    focal <= 0 ||
    rvec.length < 3 ||
    tvec.length < 3 ||
    ![rvec[0], rvec[1], rvec[2], tvec[0], tvec[1], tvec[2]].every((value) => Number.isFinite(value))
  ) {
    throw new Error("Invalid projection arguments");
  }
  if (points.length === 0) {
    return { points: [] };
  }
  const objectData: number[] = [];
  points.forEach((point) => {
    const x = Number(point?.x);
    const y = Number(point?.y);
    const z = Number(point?.z);
    if (![x, y, z].every((value) => Number.isFinite(value))) {
      throw new Error("All world points must be finite");
    }
    objectData.push(x, y, z);
  });

  let camera: any = null;
  let dist: any = null;
  let rvecMat: any = null;
  let tvecMat: any = null;
  let objectPts: any = null;
  let projected: any = null;
  try {
    camera = cameraMatrixFromFocalWeb(cv, focal, width, height);
    dist = cv.Mat.zeros(4, 1, cv.CV_64FC1);
    rvecMat = cv.matFromArray(3, 1, cv.CV_64FC1, [rvec[0], rvec[1], rvec[2]]);
    tvecMat = cv.matFromArray(3, 1, cv.CV_64FC1, [tvec[0], tvec[1], tvec[2]]);
    objectPts = cv.matFromArray(points.length, 1, cv.CV_64FC3, objectData);
    projected = new cv.Mat();
    cv.projectPoints(objectPts, rvecMat, tvecMat, camera, dist, projected);
    const data64 = projected.data64F as Float64Array | undefined;
    const data32 = projected.data32F as Float32Array | undefined;
    const out: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < points.length; index += 1) {
      const offset = index * 2;
      const px = data64 && data64.length > offset + 1 ? Number(data64[offset]) : Number(data32?.[offset]);
      const py = data64 && data64.length > offset + 1 ? Number(data64[offset + 1]) : Number(data32?.[offset + 1]);
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        throw new Error("OpenCV projectPoints returned invalid output");
      }
      out.push({ x: px, y: py });
    }
    return { points: out };
  } finally {
    if (projected && typeof projected.delete === "function") {
      projected.delete();
    }
    if (objectPts && typeof objectPts.delete === "function") {
      objectPts.delete();
    }
    if (tvecMat && typeof tvecMat.delete === "function") {
      tvecMat.delete();
    }
    if (rvecMat && typeof rvecMat.delete === "function") {
      rvecMat.delete();
    }
    if (dist && typeof dist.delete === "function") {
      dist.delete();
    }
    if (camera && typeof camera.delete === "function") {
      camera.delete();
    }
  }
}

function cameraMatrixFromFocalWeb(cv: any, focal: number, width: number, height: number): any {
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  return cv.matFromArray(3, 3, cv.CV_64FC1, [focal, 0, cx, 0, focal, cy, 0, 0, 1]);
}

function buildPosePointMats(cv: any, correspondences: PoseCorrespondence[]): { objectPts: any; imagePts: any } {
  const objectData: number[] = [];
  const imageData: number[] = [];
  correspondences.forEach((entry) => {
    objectData.push(entry.world[0], entry.world[1], entry.world[2]);
    imageData.push(entry.image[0], entry.image[1]);
  });
  return {
    objectPts: cv.matFromArray(correspondences.length, 1, cv.CV_64FC3, objectData),
    imagePts: cv.matFromArray(correspondences.length, 1, cv.CV_64FC2, imageData),
  };
}

function extractInlierIndexesFromMat(inliersMat: any, pointCount: number): number[] {
  if (!inliersMat || typeof inliersMat.rows !== "number" || inliersMat.rows <= 0) {
    return [];
  }
  const raw: number[] = [];
  const data32S = inliersMat.data32S as Int32Array | undefined;
  const data32F = inliersMat.data32F as Float32Array | undefined;
  const data64F = inliersMat.data64F as Float64Array | undefined;
  if (data32S && data32S.length > 0) {
    for (let i = 0; i < data32S.length; i += 1) {
      raw.push(Number(data32S[i]));
    }
  } else if (data32F && data32F.length > 0) {
    for (let i = 0; i < data32F.length; i += 1) {
      raw.push(Math.round(Number(data32F[i])));
    }
  } else if (data64F && data64F.length > 0) {
    for (let i = 0; i < data64F.length; i += 1) {
      raw.push(Math.round(Number(data64F[i])));
    }
  }
  return Array.from(
    new Set(
      raw.filter((index) => Number.isInteger(index) && index >= 0 && index < pointCount)
    )
  ).sort((a, b) => a - b);
}

function getVec3FromMat(mat: any): [number, number, number] {
  const data64 = mat?.data64F as Float64Array | undefined;
  if (data64 && data64.length >= 3) {
    return [Number(data64[0]), Number(data64[1]), Number(data64[2])];
  }
  const data32 = mat?.data32F as Float32Array | undefined;
  if (data32 && data32.length >= 3) {
    return [Number(data32[0]), Number(data32[1]), Number(data32[2])];
  }
  return [0, 0, 0];
}

function evaluatePoseForFocalWeb(
  cv: any,
  correspondences: PoseCorrespondence[],
  width: number,
  height: number,
  focal: number
): {
  cost: number;
  inlierCount: number;
  rvec: [number, number, number];
  tvec: [number, number, number];
  rmse: number;
} {
  let objectPts: any = null;
  let imagePts: any = null;
  let camera: any = null;
  let dist: any = null;
  let rvec: any = null;
  let tvec: any = null;
  let inliers: any = null;
  let projected: any = null;
  let objectPtsInlier: any = null;
  let imagePtsInlier: any = null;
  try {
    const mats = buildPosePointMats(cv, correspondences);
    objectPts = mats.objectPts;
    imagePts = mats.imagePts;
    camera = cameraMatrixFromFocalWeb(cv, focal, width, height);
    dist = cv.Mat.zeros(4, 1, cv.CV_64FC1);
    rvec = new cv.Mat();
    tvec = new cv.Mat();
    inliers = new cv.Mat();

    const pointCount = correspondences.length;
    let ok = false;
    try {
      ok = cv.solvePnPRansac(
        objectPts,
        imagePts,
        camera,
        dist,
        rvec,
        tvec,
        false,
        800,
        4.0,
        0.999,
        inliers,
        cv.SOLVEPNP_EPNP
      );
    } catch {
      ok = false;
    }

    if (!ok) {
      try {
        ok = cv.solvePnP(
          objectPts,
          imagePts,
          camera,
          dist,
          rvec,
          tvec,
          false,
          cv.SOLVEPNP_ITERATIVE
        );
      } catch {
        ok = false;
      }
      if (!ok) {
        return {
          cost: Number.POSITIVE_INFINITY,
          inlierCount: 0,
          rvec: [0, 0, 0],
          tvec: [0, 0, 0],
          rmse: Number.POSITIVE_INFINITY,
        };
      }
    }

    let inlierIndexes = extractInlierIndexesFromMat(inliers, pointCount);
    if (inlierIndexes.length < 4) {
      inlierIndexes = Array.from({ length: pointCount }, (_, index) => index);
    }
    const objectInlierData: number[] = [];
    const imageInlierData: number[] = [];
    inlierIndexes.forEach((index) => {
      objectInlierData.push(
        correspondences[index].world[0],
        correspondences[index].world[1],
        correspondences[index].world[2]
      );
      imageInlierData.push(correspondences[index].image[0], correspondences[index].image[1]);
    });
    objectPtsInlier = cv.matFromArray(inlierIndexes.length, 1, cv.CV_64FC3, objectInlierData);
    imagePtsInlier = cv.matFromArray(inlierIndexes.length, 1, cv.CV_64FC2, imageInlierData);
    try {
      const okRefine = cv.solvePnP(
        objectPtsInlier,
        imagePtsInlier,
        camera,
        dist,
        rvec,
        tvec,
        true,
        cv.SOLVEPNP_ITERATIVE
      );
      if (!okRefine) {
        return {
          cost: Number.POSITIVE_INFINITY,
          inlierCount: inlierIndexes.length,
          rvec: [0, 0, 0],
          tvec: [0, 0, 0],
          rmse: Number.POSITIVE_INFINITY,
        };
      }
      if (typeof cv.solvePnPRefineLM === "function") {
        try {
          cv.solvePnPRefineLM(objectPtsInlier, imagePtsInlier, camera, dist, rvec, tvec);
        } catch {
          // Optional refinement is best effort.
        }
      }
    } catch {
      return {
        cost: Number.POSITIVE_INFINITY,
        inlierCount: inlierIndexes.length,
        rvec: [0, 0, 0],
        tvec: [0, 0, 0],
        rmse: Number.POSITIVE_INFINITY,
      };
    }

    projected = new cv.Mat();
    cv.projectPoints(objectPts, rvec, tvec, camera, dist, projected);
    const projData = (projected.data64F as Float64Array | undefined) ?? new Float64Array();
    const delta = 5.0;
    let huberSum = 0;
    let sqSum = 0;
    let errCount = 0;
    for (let i = 0; i < correspondences.length; i += 1) {
      const px = Number(projData[i * 2]);
      const py = Number(projData[i * 2 + 1]);
      const dx = px - correspondences[i].image[0];
      const dy = py - correspondences[i].image[1];
      const err = Math.hypot(dx, dy);
      huberSum += err <= delta ? 0.5 * err * err : delta * (err - 0.5 * delta);
      sqSum += err * err;
      errCount += 1;
    }
    const outlierPenalty = (pointCount - inlierIndexes.length) * delta * delta;
    const cost = errCount > 0 ? huberSum / errCount + outlierPenalty : Number.POSITIVE_INFINITY;
    const rmse = errCount > 0 ? Math.sqrt(sqSum / errCount) : Number.POSITIVE_INFINITY;

    return {
      cost,
      inlierCount: inlierIndexes.length,
      rvec: getVec3FromMat(rvec),
      tvec: getVec3FromMat(tvec),
      rmse,
    };
  } finally {
    if (imagePtsInlier && typeof imagePtsInlier.delete === "function") {
      imagePtsInlier.delete();
    }
    if (objectPtsInlier && typeof objectPtsInlier.delete === "function") {
      objectPtsInlier.delete();
    }
    if (projected && typeof projected.delete === "function") {
      projected.delete();
    }
    if (inliers && typeof inliers.delete === "function") {
      inliers.delete();
    }
    if (tvec && typeof tvec.delete === "function") {
      tvec.delete();
    }
    if (rvec && typeof rvec.delete === "function") {
      rvec.delete();
    }
    if (dist && typeof dist.delete === "function") {
      dist.delete();
    }
    if (camera && typeof camera.delete === "function") {
      camera.delete();
    }
    if (imagePts && typeof imagePts.delete === "function") {
      imagePts.delete();
    }
    if (objectPts && typeof objectPts.delete === "function") {
      objectPts.delete();
    }
  }
}

function goldenSectionSearchWeb(
  fn: (value: number) => number,
  lo: number,
  hi: number,
  iterations = 48
): { x: number; value: number } {
  const phi = (1 + Math.sqrt(5)) * 0.5;
  const invPhi = 1 / phi;
  let x1 = hi - (hi - lo) * invPhi;
  let x2 = lo + (hi - lo) * invPhi;
  let f1 = fn(x1);
  let f2 = fn(x2);
  for (let i = 0; i < iterations; i += 1) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - (hi - lo) * invPhi;
      f1 = fn(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + (hi - lo) * invPhi;
      f2 = fn(x2);
    }
  }
  return f1 < f2 ? { x: x1, value: f1 } : { x: x2, value: f2 };
}

function poseToCameraWorldAndMinecraftAnglesWeb(
  cv: any,
  rvec: [number, number, number],
  tvec: [number, number, number]
): { camera: [number, number, number]; yaw: number; pitch: number } {
  let rvecMat: any = null;
  let rmat: any = null;
  try {
    rvecMat = cv.matFromArray(3, 1, cv.CV_64FC1, [rvec[0], rvec[1], rvec[2]]);
    rmat = new cv.Mat();
    cv.Rodrigues(rvecMat, rmat);
    const r = (rmat.data64F as Float64Array | undefined) ?? new Float64Array();
    const tx = tvec[0];
    const ty = tvec[1];
    const tz = tvec[2];
    const camX = -(r[0] * tx + r[3] * ty + r[6] * tz);
    const camY = -(r[1] * tx + r[4] * ty + r[7] * tz);
    const camZ = -(r[2] * tx + r[5] * ty + r[8] * tz);
    let fx = r[6];
    let fy = r[7];
    let fz = r[8];
    const norm = Math.hypot(fx, fy, fz);
    if (norm > 1e-12) {
      fx /= norm;
      fy /= norm;
      fz /= norm;
    }
    const pitch = (Math.asin(Math.max(-1, Math.min(1, -fy))) * 180) / Math.PI;
    const yaw = wrapDegrees180((Math.atan2(-fx, fz) * 180) / Math.PI);
    return {
      camera: [camX, camY, camZ],
      yaw,
      pitch,
    };
  } finally {
    if (rmat && typeof rmat.delete === "function") {
      rmat.delete();
    }
    if (rvecMat && typeof rvecMat.delete === "function") {
      rvecMat.delete();
    }
  }
}

async function runWebPoseSolve(
  getWebMcvRuntime: () => Promise<any>,
  args: McvPoseSolveArgs
): Promise<McvPoseSolveResult> {
  const cv = await getWebMcvRuntime();
  const width = Math.floor(Number(args.width));
  const height = Math.floor(Number(args.height));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("width and height must be positive integers");
  }
  const lines = Array.isArray(args.lines) ? args.lines : [];
  const vertices = Array.isArray(args.vertices) ? args.vertices : [];
  const correspondences = buildPoseCorrespondencesFromStructure(lines, vertices);
  if (correspondences.length < 4) {
    throw new Error("Need at least 4 valid vertex correspondences with known world coordinates");
  }

  const initialVfovDeg =
    isFiniteNumber(args.initial_vfov_deg) && args.initial_vfov_deg > 1 && args.initial_vfov_deg < 179
      ? args.initial_vfov_deg
      : 70;
  const fInit = (height * 0.5) / Math.tan((initialVfovDeg * 0.5 * Math.PI) / 180);
  const fMin = Math.max(20, fInit * 0.3);
  const fMax = fInit * 3;

  const cache = new Map<number, ReturnType<typeof evaluatePoseForFocalWeb>>();
  const evalLogF = (logf: number): number => {
    if (!cache.has(logf)) {
      const focal = Math.exp(logf);
      cache.set(logf, evaluatePoseForFocalWeb(cv, correspondences, width, height, focal));
    }
    return cache.get(logf)!.cost;
  };

  const sampleCount = 44;
  const logs: number[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    logs.push(Math.log(fMin) + (Math.log(fMax) - Math.log(fMin)) * (i / (sampleCount - 1)));
  }
  const costs = logs.map((logf) => evalLogF(logf));
  let bestIdx = 0;
  for (let i = 1; i < costs.length; i += 1) {
    if (costs[i] < costs[bestIdx]) {
      bestIdx = i;
    }
  }
  const loIdx = Math.max(0, bestIdx - 2);
  const hiIdx = Math.min(logs.length - 1, bestIdx + 2);
  let lo = logs[loIdx];
  let hi = logs[hiIdx];
  if (!(hi > lo)) {
    lo = logs[0];
    hi = logs[logs.length - 1];
  }

  const bestLog = goldenSectionSearchWeb(evalLogF, lo, hi, 32).x;
  const bestFocal = Math.exp(bestLog);
  const bestPose = evaluatePoseForFocalWeb(cv, correspondences, width, height, bestFocal);
  if (!Number.isFinite(bestPose.cost)) {
    throw new Error("Focal search failed to find a valid PnP solution");
  }

  const hfovDeg = (2 * Math.atan((width * 0.5) / bestFocal) * 180) / Math.PI;
  const vfovDeg = (2 * Math.atan((height * 0.5) / bestFocal) * 180) / Math.PI;
  const worldPose = poseToCameraWorldAndMinecraftAnglesWeb(cv, bestPose.rvec, bestPose.tvec);
  const reprojectedLines = buildReprojectedLinesWeb(
    cv,
    lines,
    vertices,
    bestPose.rvec,
    bestPose.tvec,
    bestFocal,
    width,
    height
  );
  const playerY = worldPose.camera[1] - 1.62;
  const tpCommand = `/tp @s ${worldPose.camera[0].toFixed(6)} ${playerY.toFixed(6)} ${worldPose.camera[2].toFixed(6)} ${worldPose.yaw.toFixed(6)} ${worldPose.pitch.toFixed(6)}`;

  return {
    point_count: correspondences.length,
    inlier_count: bestPose.inlierCount,
    image_width: width,
    image_height: height,
    initial_vfov_deg: initialVfovDeg,
    initial_focal_px: fInit,
    optimized_focal_px: bestFocal,
    optimized_hfov_deg: hfovDeg,
    optimized_vfov_deg: vfovDeg,
    reprojection_rmse_px: bestPose.rmse,
    camera_position: {
      x: worldPose.camera[0],
      y: worldPose.camera[1],
      z: worldPose.camera[2],
    },
    player_position: {
      x: worldPose.camera[0],
      y: playerY,
      z: worldPose.camera[2],
    },
    rotation: {
      yaw: worldPose.yaw,
      pitch: worldPose.pitch,
    },
    rvec: [bestPose.rvec[0], bestPose.rvec[1], bestPose.rvec[2]],
    tvec: [bestPose.tvec[0], bestPose.tvec[1], bestPose.tvec[2]],
    tp_command: tpCommand,
    reprojected_lines: reprojectedLines,
  };
}

export function createMcvClient(config: McvClientConfig): McvClientRuntime {
  let cvPromise: Promise<unknown> | null = null;
  const sobelSessionId = createSessionId();
  const webSobelCache = new Map<string, McvWebSobelCacheEntry>();

  async function getWebMcvRuntime(): Promise<any> {
    if (!cvPromise) {
      cvPromise = (async () => {
        const maybeGlobalCv = (globalThis as any).cv;
        if (!maybeGlobalCv) {
          await loadScriptOnce(config.opencvUrl);
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

  async function runPoseSolve(args: McvPoseSolveArgs): Promise<McvPoseSolveResult> {
    if (config.backend === "web") {
      return await runWebPoseSolve(getWebMcvRuntime, args);
    }
    const response = await callMcvApi<McvPoseSolveResult>({
      op: "cv.poseSolve",
      args,
    });
    if (!response.ok) {
      throw new Error(response.error.message || "Pose solve failed");
    }
    return response.data;
  }

  async function runProjectWorldPoints(
    args: McvProjectWorldPointsArgs
  ): Promise<McvProjectWorldPointsResult> {
    if (config.backend === "web") {
      const cv = await getWebMcvRuntime();
      return runWebProjectWorldPoints(cv, args);
    }
    const response = await callMcvApi<McvProjectWorldPointsResult>({
      op: "cv.projectWorldPoints",
      args,
    });
    if (!response.ok) {
      throw new Error(response.error.message || "World projection failed");
    }
    return response.data;
  }

  async function runOpopRefineLine(
    imageDataUrl: string,
    line: McvOpopLine,
    settings: McvOpopSettings,
    dragLine?: McvOpopLine,
    excludeRanges?: McvOpopExcludeRange[]
  ): Promise<McvOpopRefineLineResult> {
    if (typeof imageDataUrl !== "string" || !imageDataUrl.trim()) {
      throw new Error("image_data_url is required");
    }
    const cacheKey = hashStringFnv1aHex(imageDataUrl);
    if (config.backend === "web") {
      let sobelEntry = webSobelCache.get(cacheKey);
      if (!sobelEntry) {
        sobelEntry = await computeColorSobelWeb(getWebMcvRuntime, imageDataUrl);
        webSobelCache.set(cacheKey, sobelEntry);
      }
      return runWebOpopRefineLine(sobelEntry, line, settings, dragLine, excludeRanges);
    }

    const normalizedExcludeRanges = normalizeOpopExcludeRanges(excludeRanges);

    const response = await callMcvApi<McvOpopRefineLineResult>({
      op: "cv.opopRefineLine",
      args: {
        session_id: sobelSessionId,
        cache_key: cacheKey,
        line,
        ...(dragLine ? { drag_line: dragLine } : {}),
        ...(normalizedExcludeRanges.length > 0
          ? {
              exclude_ranges: normalizedExcludeRanges.map((range) => ({
                start_t: range.startT,
                end_t: range.endT,
              })),
            }
          : {}),
        settings,
      } satisfies McvOpopRefineLineArgs,
    });
    if (!response.ok) {
      throw new Error(response.error.message || "OPOP line refinement failed");
    }
    return response.data;
  }

  async function prepareSobelCache(imageDataUrl: string): Promise<void> {
    if (typeof imageDataUrl !== "string" || !imageDataUrl.trim()) {
      throw new Error("image_data_url is required");
    }
    const cacheKey = hashStringFnv1aHex(imageDataUrl);
    if (config.backend === "web") {
      if (webSobelCache.has(cacheKey)) {
        return;
      }
      const entry = await computeColorSobelWeb(getWebMcvRuntime, imageDataUrl);
      webSobelCache.set(cacheKey, entry);
      return;
    }

    const response = await callMcvApi<McvSobelPrecomputeResult>({
      op: "cv.precomputeSobel",
      args: {
        image_data_url: imageDataUrl,
        session_id: sobelSessionId,
        cache_key: cacheKey,
      } satisfies McvSobelPrecomputeArgs,
    });
    if (!response.ok) {
      throw new Error(response.error.message || "Failed to precompute Sobel cache");
    }
  }

  async function clearSobelCache(reason: "viewer_exit" | "unload" = "viewer_exit"): Promise<void> {
    if (config.backend === "web") {
      if (reason === "unload") {
        webSobelCache.clear();
      }
      return;
    }

    if (reason === "unload" && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const url = `/api/mcv/cache/clear?session_id=${encodeURIComponent(sobelSessionId)}`;
      try {
        const payload = new Blob([JSON.stringify({ session_id: sobelSessionId })], {
          type: "application/json",
        });
        navigator.sendBeacon(url, payload);
        return;
      } catch {
        // Fall through to standard fetch request.
      }
    }

    const response = await callMcvApi<McvSobelCacheClearResult>({
      op: "cv.clearCache",
      args: {
        session_id: sobelSessionId,
      },
    });
    if (!response.ok) {
      throw new Error(response.error.message || "Failed to clear Sobel cache");
    }
  }

  async function callMcvApi<TData>(requestBody: McvRequest): Promise<McvResponse<TData>> {
    if (config.backend === "web") {
      try {
        if (requestBody.op === "cv.poseSolve") {
          const data = await runWebPoseSolve(getWebMcvRuntime, requestBody.args as McvPoseSolveArgs);
          return {
            ok: true,
            data,
          } as McvResponse<TData>;
        }
        if (requestBody.op === "cv.opopRefineLine") {
          const args = requestBody.args as (McvOpopRefineLineArgs & { image_data_url?: string }) | undefined;
          const imageDataUrl = typeof args?.image_data_url === "string" ? args.image_data_url : "";
          if (!imageDataUrl) {
            return {
              ok: false,
              error: {
                code: "INVALID_ARGS",
                message: "image_data_url is required for web cv.opopRefineLine",
              },
            };
          }
          if (!args?.line || !args?.settings) {
            return {
              ok: false,
              error: {
                code: "INVALID_ARGS",
                message: "line and settings are required for cv.opopRefineLine",
              },
            };
          }
          const data = await runOpopRefineLine(
            imageDataUrl,
            args.line,
            args.settings,
            args.drag_line,
            Array.isArray(args.exclude_ranges)
              ? args.exclude_ranges.map((range) => ({
                  startT: Number(range?.start_t),
                  endT: Number(range?.end_t),
                }))
              : undefined
          );
          return {
            ok: true,
            data,
          } as McvResponse<TData>;
        }
        if (requestBody.op === "cv.projectWorldPoints") {
          const args = requestBody.args as McvProjectWorldPointsArgs | undefined;
          if (!args) {
            return {
              ok: false,
              error: {
                code: "INVALID_ARGS",
                message: "args are required for cv.projectWorldPoints",
              },
            };
          }
          const data = await runProjectWorldPoints(args);
          return {
            ok: true,
            data,
          } as McvResponse<TData>;
        }
        return {
          ok: false,
          error: {
            code: "UNKNOWN_OP",
            message: `Unsupported operation in web backend: ${requestBody.op}`,
          },
        };
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
    return fetch(config.mediaApiUrl);
  }

  function isMediaApiAvailable(): boolean {
    return typeof config.mediaApiUrl === "string" && config.mediaApiUrl.trim().length > 0;
  }

  function isDataApiAvailable(): boolean {
    return typeof config.dataApiUrl === "string" && config.dataApiUrl.trim().length > 0;
  }

  return {
    callMcvApi,
    runPoseSolve,
    runProjectWorldPoints,
    runOpopRefineLine,
    prepareSobelCache,
    clearSobelCache,
    fetchMediaApi,
    isMediaApiAvailable,
    isDataApiAvailable,
  };
}
