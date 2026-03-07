import { wrapDegrees180 } from "./geometry";

type McvOperation = "cv.opencvTest" | "cv.poseSolve";

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

type McvLineSegment = [number, number, number, number];

type McvImagePipelineArgs = {
  image_data_url: string;
  canny_threshold1?: number;
  canny_threshold2?: number;
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
  tp_command: string;
};

type PoseCorrespondence = {
  image: [number, number];
  world: [number, number, number];
};

type McvClientConfig = {
  backend: "python" | "web";
  opencvUrl: string;
  mediaApiUrl: string;
  dataApiUrl: string;
};

type McvClientRuntime = {
  callMcvApi: <TData>(requestBody: McvRequest) => Promise<McvResponse<TData>>;
  runImagePipeline: (args: McvImagePipelineArgs) => Promise<McvImagePipelineResult>;
  runPoseSolve: (args: McvPoseSolveArgs) => Promise<McvPoseSolveResult>;
  fetchMediaApi: () => Promise<Response>;
  isMediaApiAvailable: () => boolean;
  isDataApiAvailable: () => boolean;
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
    tp_command: tpCommand,
  };
}

export function createMcvClient(config: McvClientConfig): McvClientRuntime {
  let cvPromise: Promise<unknown> | null = null;

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

    if (config.backend === "web") {
      return await runWebImagePipeline(args);
    }

    return await runPythonImagePipeline(args);
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

  async function callMcvApi<TData>(requestBody: McvRequest): Promise<McvResponse<TData>> {
    if (config.backend === "web") {
      if (requestBody.op !== "cv.opencvTest" && requestBody.op !== "cv.poseSolve") {
        return {
          ok: false,
          error: {
            code: "UNKNOWN_OP",
            message: `Unsupported operation in web backend: ${requestBody.op}`,
          },
        };
      }

      try {
        if (requestBody.op === "cv.poseSolve") {
          const data = await runWebPoseSolve(getWebMcvRuntime, requestBody.args as McvPoseSolveArgs);
          return {
            ok: true,
            data,
          } as McvResponse<TData>;
        }
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
    runImagePipeline,
    runPoseSolve,
    fetchMediaApi,
    isMediaApiAvailable,
    isDataApiAvailable,
  };
}
