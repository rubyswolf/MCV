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

type McvImagePipelineArgs = {
  image_data_url: string;
  canny_threshold1?: number;
  canny_threshold2?: number;
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

type McvLineSegment = [number, number, number, number];
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
  anchor?: number;
  vertex?: number;
};
type StructureLine = {
  from: StructureEndpoint;
  to: StructureEndpoint;
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
type StructureData = {
  lines: StructureLine[];
  anchors: StructureAnchor[];
  vertices: StructureVertexData[];
};
type DraftManualLine = {
  from: ManualPoint;
  to: ManualPoint;
  axis: ManualAxis;
  flipped: boolean;
  length?: number;
};
type ManualInteractionMode = "draw" | "anchor" | "edit" | "vertexSolve" | "poseSolve";
type StructureVertex = {
  endpointIds: number[];
  point: ManualPoint;
  lineIndexes: number[];
};
type VertexSolveRenderData = {
  traversedLineIndexes: Set<number>;
  generatedVertexIndexes: Set<number>;
  anchorVertexIndexes: Set<number>;
  conflictVertexIndex: number | null;
  conflictCoordPair: { existing: VertexSolveCoord; inferred: VertexSolveCoord } | null;
  topologyCoords: VertexSolveCoord[];
  topologyVertices: StructureVertex[];
};
type VertexSolveCoord = {
  x?: number;
  y?: number;
  z?: number;
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
    runPoseSolve: typeof runPoseSolve;
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
      source?: McvDataSource;
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
let viewerActiveVideoContext: ViewerMedia | null = null;
let pendingImportedMcvState:
  | {
      annotations: ManualAnnotation[];
      anchors: StructureAnchor[];
      vertices: StructureVertexData[];
      source?: McvDataSource;
    }
  | null = null;
let pendingImportedVideoSourceForImageLoad: McvDataSource | null = null;
let hasUnsavedChanges = false;
let analyzeOverwriteArmed = false;
let backDiscardArmed = false;
let activeAnalyzeButton: HTMLButtonElement | null = null;
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
const MCV_DATA: { annotations: ManualAnnotation[]; structure: StructureData; source?: McvDataSource } = {
  annotations: [],
  structure: {
    lines: [],
    anchors: [],
    vertices: [],
  },
};
let manualRedoLines: ManualAnnotation[] = [];
let manualDraftLine: DraftManualLine | null = null;
let manualDragPointerId: number | null = null;
let manualDragClientX = 0;
let manualDragClientY = 0;
let manualInteractionMode: ManualInteractionMode = "draw";
let manualAnchorSelectedIndex: number | null = null;
let manualAnchorSelectedInput = "";
let manualAnchorHoveredVertex: StructureVertex | null = null;
let manualEditHoveredLineIndex: number | null = null;
let manualEditSelectedLineIndex: number | null = null;
let vertexSolveRenderData: VertexSolveRenderData | null = null;
let vertexSolveHoveredVertexIndex: number | null = null;
let poseSolveReferenceInput = "";
let poseSolveState:
  | {
      status: "idle" | "running" | "done" | "error";
      result?: McvPoseSolveResult;
      error?: string;
    }
  | null = null;
let poseSolveRunToken = 0;
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

function normalizeLineRefs(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function remapLineRefsAfterLineRemoval(values: number[], removedLineIndex: number): number[] {
  return normalizeLineRefs(
    values
      .filter((value) => value !== removedLineIndex)
      .map((value) => (value > removedLineIndex ? value - 1 : value))
  );
}

function syncStructureEndpointRefs(): void {
  MCV_DATA.structure.lines.forEach((line) => {
    delete line.from.anchor;
    delete line.to.anchor;
    delete line.from.vertex;
    delete line.to.vertex;
  });
  MCV_DATA.structure.anchors.forEach((anchor, anchorIndex) => {
    anchor.from.forEach((lineIndex) => {
      const line = MCV_DATA.structure.lines[lineIndex];
      if (line) {
        line.from.anchor = anchorIndex;
      }
    });
    anchor.to.forEach((lineIndex) => {
      const line = MCV_DATA.structure.lines[lineIndex];
      if (line) {
        line.to.anchor = anchorIndex;
      }
    });
  });
  MCV_DATA.structure.vertices.forEach((vertex, vertexIndex) => {
    vertex.from.forEach((lineIndex) => {
      const line = MCV_DATA.structure.lines[lineIndex];
      if (line) {
        line.from.vertex = vertexIndex;
      }
    });
    vertex.to.forEach((lineIndex) => {
      const line = MCV_DATA.structure.lines[lineIndex];
      if (line) {
        line.to.vertex = vertexIndex;
      }
    });
  });
}

function rebuildAnchorsAndVerticesAfterLineRemoval(removedLineIndex: number): void {
  const oldAnchors = MCV_DATA.structure.anchors;
  const oldVertices = MCV_DATA.structure.vertices;

  const keptAnchors = oldAnchors
    .map((anchor, oldAnchorIndex) => {
      const from = remapLineRefsAfterLineRemoval(anchor.from, removedLineIndex);
      const to = remapLineRefsAfterLineRemoval(anchor.to, removedLineIndex);
      if (from.length === 0 && to.length === 0) {
        return null;
      }
      return {
        oldAnchorIndex,
        anchor: {
          ...anchor,
          from,
          to,
        },
      };
    })
    .filter((value): value is { oldAnchorIndex: number; anchor: StructureAnchor } => !!value);

  const remappedVertices = oldVertices.map((vertex) => ({
    ...vertex,
    from: remapLineRefsAfterLineRemoval(vertex.from, removedLineIndex),
    to: remapLineRefsAfterLineRemoval(vertex.to, removedLineIndex),
  }));

  const newVertices: StructureVertexData[] = [];
  const usedOldVertexIndexes = new Set<number>();

  keptAnchors.forEach((entry, newAnchorIndex) => {
    const oldVertexIndex = entry.anchor.vertex;
    const oldVertex =
      oldVertexIndex >= 0 && oldVertexIndex < remappedVertices.length
        ? remappedVertices[oldVertexIndex]
        : undefined;
    if (oldVertex !== undefined) {
      usedOldVertexIndexes.add(oldVertexIndex);
    }
    const vertexFrom = oldVertex ? oldVertex.from : entry.anchor.from;
    const vertexTo = oldVertex ? oldVertex.to : entry.anchor.to;
    const nextVertex: StructureVertexData = {
      from: normalizeLineRefs(vertexFrom.length > 0 ? vertexFrom : entry.anchor.from),
      to: normalizeLineRefs(vertexTo.length > 0 ? vertexTo : entry.anchor.to),
      ...(oldVertex?.x !== undefined ? { x: oldVertex.x } : {}),
      ...(oldVertex?.y !== undefined ? { y: oldVertex.y } : {}),
      ...(oldVertex?.z !== undefined ? { z: oldVertex.z } : {}),
      anchor: newAnchorIndex,
    };
    newVertices.push(nextVertex);
    entry.anchor.vertex = newVertices.length - 1;
  });

  remappedVertices.forEach((vertex, oldVertexIndex) => {
    if (usedOldVertexIndexes.has(oldVertexIndex)) {
      return;
    }
    if (vertex.anchor !== undefined) {
      return;
    }
    newVertices.push({
      ...vertex,
      from: normalizeLineRefs(vertex.from),
      to: normalizeLineRefs(vertex.to),
    });
  });

  MCV_DATA.structure.anchors = keptAnchors.map((entry) => ({
    ...entry.anchor,
    from: normalizeLineRefs(entry.anchor.from),
    to: normalizeLineRefs(entry.anchor.to),
  }));
  MCV_DATA.structure.vertices = newVertices;
}

function createAnchorWithVertex(from: number[], to: number[]): number {
  const normalizedFrom = normalizeLineRefs(from);
  const normalizedTo = normalizeLineRefs(to);
  const vertexIndex = MCV_DATA.structure.vertices.length;
  const anchorIndex = MCV_DATA.structure.anchors.length;
  MCV_DATA.structure.vertices.push({
    from: normalizedFrom,
    to: normalizedTo,
    anchor: anchorIndex,
  });
  MCV_DATA.structure.anchors.push({
    from: normalizedFrom,
    to: normalizedTo,
    vertex: vertexIndex,
  });
  return anchorIndex;
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
  syncStructureEndpointRefs();
  markAnnotationsDirty();
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
  rebuildAnchorsAndVerticesAfterLineRemoval(removedIndex);
  if (manualAnchorSelectedIndex !== null) {
    manualAnchorSelectedIndex = null;
    manualAnchorSelectedInput = "";
  }
  if (manualEditSelectedLineIndex !== null) {
    if (manualEditSelectedLineIndex === removedIndex) {
      manualEditSelectedLineIndex = null;
    } else if (manualEditSelectedLineIndex > removedIndex) {
      manualEditSelectedLineIndex -= 1;
    }
  }
  if (manualEditHoveredLineIndex !== null) {
    if (manualEditHoveredLineIndex === removedIndex) {
      manualEditHoveredLineIndex = null;
    } else if (manualEditHoveredLineIndex > removedIndex) {
      manualEditHoveredLineIndex -= 1;
    }
  }
  recomputeStructureGeometryFromConnections();
  syncStructureEndpointRefs();
  markAnnotationsDirty();
  return removed;
}

function rebuildStructureFromAnnotations(): void {
  const annotations = MCV_DATA.annotations;
  MCV_DATA.structure.lines = annotations.map((line) => createStructureLineFromAnnotation(line));
  for (let i = 0; i < MCV_DATA.structure.lines.length; i += 1) {
    linkLineIndexAgainstOthers(i);
  }
  recomputeStructureGeometryFromConnections();
  syncStructureEndpointRefs();
}

function resetCropInteractionState(): void {
  MCV_DATA.annotations.length = 0;
  MCV_DATA.structure.lines.length = 0;
  MCV_DATA.structure.anchors.length = 0;
  MCV_DATA.structure.vertices.length = 0;
  manualRedoLines.length = 0;
  manualDraftLine = null;
  manualDragPointerId = null;
  manualDragClientX = 0;
  manualDragClientY = 0;
  manualInteractionMode = "draw";
  manualAnchorSelectedIndex = null;
  manualAnchorSelectedInput = "";
  manualAnchorHoveredVertex = null;
  manualEditHoveredLineIndex = null;
  manualEditSelectedLineIndex = null;
  vertexSolveRenderData = null;
  vertexSolveHoveredVertexIndex = null;
  poseSolveState = null;
  poseSolveRunToken += 1;
  manualAxisStartsBackwards = false;
  renderAnnotationPreviewHeld = false;
  clearAnnotationsDirty();
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

type PoseCorrespondence = {
  image: [number, number];
  world: [number, number, number];
};

function buildPoseCorrespondencesFromStructure(
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

function wrapDegrees180(angleDeg: number): number {
  return ((angleDeg + 180) % 360) - 180;
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

async function runWebPoseSolve(args: McvPoseSolveArgs): Promise<McvPoseSolveResult> {
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

async function runPoseSolve(args: McvPoseSolveArgs): Promise<McvPoseSolveResult> {
  if (__MCV_BACKEND__ === "web") {
    return await runWebPoseSolve(args);
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
  if (__MCV_BACKEND__ === "web") {
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
        const data = await runWebPoseSolve(requestBody.args as McvPoseSolveArgs);
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
      runPoseSolve: runPoseSolve,
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

function getViewerBackButtonNode(): HTMLButtonElement | null {
  return document.getElementById("viewer-back") as HTMLButtonElement | null;
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

function refreshUnsavedActionUi(): void {
  const backButton = getViewerBackButtonNode();
  if (backButton) {
    backButton.textContent = backDiscardArmed ? "Confirm discarding changes" : "Back";
  }
  if (activeAnalyzeButton) {
    activeAnalyzeButton.textContent = analyzeOverwriteArmed ? "Confirm overwrite" : "Analyze!";
    activeAnalyzeButton.classList.toggle("warning", analyzeOverwriteArmed);
  }
}

function clearUnsavedConfirmationArms(): void {
  analyzeOverwriteArmed = false;
  backDiscardArmed = false;
  refreshUnsavedActionUi();
}

function markAnnotationsDirty(): void {
  hasUnsavedChanges = true;
  clearUnsavedConfirmationArms();
}

function clearAnnotationsDirty(): void {
  hasUnsavedChanges = false;
  clearUnsavedConfirmationArms();
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

function removePoseSolvePanel(): void {
  const contentNode = getViewerContentNode();
  if (!contentNode) {
    return;
  }
  const panel = contentNode.querySelector('[data-role="pose-solve-panel"]');
  if (panel) {
    panel.remove();
  }
}

function resetPoseSolveState(): void {
  poseSolveRunToken += 1;
  poseSolveState = null;
  removePoseSolvePanel();
}

function formatPoseNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : "nan";
}

function parsePoseReferenceInput(
  raw: string
): { x: number; y: number; z: number; yaw: number; pitch: number } | null {
  const tokens = raw
    .trim()
    .split(/[\s,]+/)
    .filter((token) => token.length > 0);
  if (tokens.length !== 5) {
    return null;
  }
  const values = tokens.map((token) => Number(token));
  if (values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return {
    x: values[0],
    y: values[1],
    z: values[2],
    yaw: values[3],
    pitch: values[4],
  };
}

function appendPoseReportRow(parent: HTMLElement, label: string, value: string): void {
  const row = document.createElement("div");
  row.className = "pose-report-row";
  const keyNode = document.createElement("div");
  keyNode.className = "pose-report-key";
  keyNode.textContent = label;
  const valueNode = document.createElement("div");
  valueNode.className = "pose-report-value";
  valueNode.textContent = value;
  row.appendChild(keyNode);
  row.appendChild(valueNode);
  parent.appendChild(row);
}

function renderPoseSolvePanel(): void {
  if (getManualInteractionMode() !== "poseSolve") {
    removePoseSolvePanel();
    return;
  }
  const contentNode = getViewerContentNode();
  if (!contentNode) {
    return;
  }
  let panel = contentNode.querySelector(
    '[data-role="pose-solve-panel"]'
  ) as HTMLDivElement | null;
  if (!panel) {
    panel = document.createElement("div");
    panel.setAttribute("data-role", "pose-solve-panel");
    panel.className = "pose-report-card";
    contentNode.appendChild(panel);
  } else {
    panel.replaceChildren();
  }

  const title = document.createElement("div");
  title.className = "pose-report-title";
  title.textContent = "PnL Pose Solve";
  panel.appendChild(title);

  if (!poseSolveState || poseSolveState.status === "idle") {
    appendPoseReportRow(panel, "Status", "Press D in vertex solve mode to run pose solve.");
    return;
  }
  if (poseSolveState.status === "running") {
    appendPoseReportRow(panel, "Status", "Solving...");
    return;
  }
  if (poseSolveState.status === "error") {
    appendPoseReportRow(panel, "Status", "Failed");
    appendPoseReportRow(panel, "Error", poseSolveState.error || "Pose solve failed");
    return;
  }
  const result = poseSolveState.result;
  if (!result) {
    appendPoseReportRow(panel, "Status", "No result");
    return;
  }

  const tpRow = document.createElement("div");
  tpRow.className = "pose-report-tp-row";
  const tpCode = document.createElement("code");
  tpCode.className = "pose-report-tp-code";
  tpCode.textContent = result.tp_command;
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "viewer-action-button";
  copyButton.textContent = "Copy";
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(result.tp_command);
      copyButton.textContent = "Copied";
    } catch {
      copyButton.textContent = "Copy failed";
    }
    window.setTimeout(() => {
      copyButton.textContent = "Copy";
    }, 1000);
  });
  tpRow.appendChild(tpCode);
  tpRow.appendChild(copyButton);
  panel.appendChild(tpRow);

  appendPoseReportRow(
    panel,
    "Points",
    `${result.point_count} (inliers: ${result.inlier_count})`
  );
  appendPoseReportRow(panel, "Image", `${result.image_width}x${result.image_height}`);
  appendPoseReportRow(
    panel,
    "Initial guess",
    `vfov=${formatPoseNumber(result.initial_vfov_deg)} deg, focal=${formatPoseNumber(result.initial_focal_px)} px`
  );
  appendPoseReportRow(panel, "Optimized focal", `${formatPoseNumber(result.optimized_focal_px)} px`);
  appendPoseReportRow(
    panel,
    "Optimized FOV",
    `h=${formatPoseNumber(result.optimized_hfov_deg)} deg, v=${formatPoseNumber(result.optimized_vfov_deg)} deg`
  );
  appendPoseReportRow(
    panel,
    "Reprojection RMSE",
    `${formatPoseNumber(result.reprojection_rmse_px)} px`
  );
  appendPoseReportRow(
    panel,
    "Camera position",
    `${formatPoseNumber(result.camera_position.x)}, ${formatPoseNumber(result.camera_position.y)}, ${formatPoseNumber(result.camera_position.z)}`
  );
  appendPoseReportRow(
    panel,
    "Player position",
    `${formatPoseNumber(result.player_position.x)}, ${formatPoseNumber(result.player_position.y)}, ${formatPoseNumber(result.player_position.z)}`
  );
  appendPoseReportRow(
    panel,
    "Rotation (yaw, pitch)",
    `${formatPoseNumber(result.rotation.yaw)}, ${formatPoseNumber(result.rotation.pitch)}`
  );

  const referenceLabel = document.createElement("div");
  referenceLabel.className = "time-label";
  referenceLabel.textContent = "Reference (x y z yaw pitch)";
  panel.appendChild(referenceLabel);

  const referenceInput = document.createElement("input");
  referenceInput.type = "text";
  referenceInput.className = "time-input";
  referenceInput.placeholder = "x y z yaw pitch";
  referenceInput.value = poseSolveReferenceInput;
  panel.appendChild(referenceInput);

  const referenceStats = document.createElement("div");
  referenceStats.className = "pose-report-stats";
  panel.appendChild(referenceStats);

  const updateReferenceStats = () => {
    poseSolveReferenceInput = referenceInput.value;
    referenceStats.replaceChildren();
    const parsed = parsePoseReferenceInput(poseSolveReferenceInput);
    if (!parsed) {
      const note = document.createElement("div");
      note.className = "pose-report-value";
      note.textContent = "Enter 5 numbers: x y z yaw pitch";
      referenceStats.appendChild(note);
      return;
    }
    const dx = result.player_position.x - parsed.x;
    const dy = result.player_position.y - parsed.y;
    const dz = result.player_position.z - parsed.z;
    const posError = Math.hypot(dx, dy, dz);
    const yawErr = Math.abs(wrapDegrees180(result.rotation.yaw - parsed.yaw));
    const pitchErr = Math.abs(result.rotation.pitch - parsed.pitch);
    const rotError = Math.hypot(yawErr, pitchErr);
    appendPoseReportRow(referenceStats, "Position error distance", `${formatPoseNumber(posError)} blocks`);
    appendPoseReportRow(referenceStats, "Rotation error distance", `${formatPoseNumber(rotError)} deg`);
  };

  referenceInput.addEventListener("input", updateReferenceStats);
  updateReferenceStats();
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
  removePoseSolvePanel();
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
      if (pendingImportedMcvState) {
        applyImportedMcvState(pendingImportedMcvState);
        pendingImportedMcvState = null;
        renderCropResultFromCache();
      }
      image.classList.add("hidden");
      startViewerMotionLoop();
      updateViewerCursor();
    }
    scrollViewerFullImageIntoView();
    if (pendingImportedVideoSourceForImageLoad) {
      const source = pendingImportedVideoSourceForImageLoad;
      pendingImportedVideoSourceForImageLoad = null;
      window.setTimeout(() => {
        mountImportedSourceVideoForCurrentImage(source);
      }, 120);
    }
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

function appendSvgPointDot(
  parent: SVGElement,
  point: ManualPoint,
  color: string,
  radius: number
): void {
  const svgNs = "http://www.w3.org/2000/svg";
  const circle = document.createElementNS(svgNs, "circle");
  circle.setAttribute("cx", String(point.x));
  circle.setAttribute("cy", String(point.y));
  circle.setAttribute("r", String(radius));
  circle.setAttribute("fill", color);
  circle.setAttribute("stroke", "#111821");
  circle.setAttribute("stroke-width", "0.8");
  circle.setAttribute("vector-effect", "non-scaling-stroke");
  parent.appendChild(circle);
}

function appendSvgAnchorLabel(
  parent: SVGElement,
  point: ManualPoint,
  label: string,
  color: string
): void {
  const svgNs = "http://www.w3.org/2000/svg";
  const text = document.createElementNS(svgNs, "text");
  text.setAttribute("x", String(point.x + 6));
  text.setAttribute("y", String(point.y - 6));
  text.setAttribute("fill", color);
  text.setAttribute("stroke", "#111821");
  text.setAttribute("stroke-width", "0.9");
  text.setAttribute("paint-order", "stroke fill");
  text.setAttribute("font-size", "9");
  text.setAttribute("font-weight", "700");
  text.setAttribute("font-family", "Segoe UI, Tahoma, sans-serif");
  text.setAttribute("vector-effect", "non-scaling-stroke");
  text.textContent = label;
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

function formatVertexSolveCoordValue(value: number | undefined): string {
  if (value === undefined) {
    return "?";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function formatVertexSolveCoordTuple(coord: VertexSolveCoord): string {
  return `(${formatVertexSolveCoordValue(coord.x)}, ${formatVertexSolveCoordValue(coord.y)}, ${formatVertexSolveCoordValue(coord.z)})`;
}

function getManualInteractionMode(): ManualInteractionMode {
  return manualInteractionMode;
}

function setManualInteractionMode(mode: ManualInteractionMode): void {
  if (manualInteractionMode === mode) {
    return;
  }
  const leavingSolveMode =
    manualInteractionMode === "vertexSolve" || manualInteractionMode === "poseSolve";
  const enteringSolveMode = mode === "vertexSolve" || mode === "poseSolve";
  if (leavingSolveMode && !enteringSolveMode) {
    purgeGeneratedVerticesKeepingAnchors();
  }
  if (manualInteractionMode === "poseSolve" && mode !== "poseSolve") {
    resetPoseSolveState();
  }
  manualInteractionMode = mode;
  if (mode === "anchor") {
    manualDraftLine = null;
    manualDragPointerId = null;
    manualEditHoveredLineIndex = null;
    manualEditSelectedLineIndex = null;
    vertexSolveRenderData = null;
    vertexSolveHoveredVertexIndex = null;
  } else if (mode === "edit") {
    manualDraftLine = null;
    manualDragPointerId = null;
    manualAnchorHoveredVertex = null;
    manualAnchorSelectedIndex = null;
    manualAnchorSelectedInput = "";
    vertexSolveRenderData = null;
    vertexSolveHoveredVertexIndex = null;
  } else if (mode === "vertexSolve") {
    resetPoseSolveState();
    manualDraftLine = null;
    manualDragPointerId = null;
    manualAnchorHoveredVertex = null;
    manualAnchorSelectedIndex = null;
    manualAnchorSelectedInput = "";
    manualEditHoveredLineIndex = null;
    manualEditSelectedLineIndex = null;
    vertexSolveRenderData = runVertexSolveAndBuildData();
    vertexSolveHoveredVertexIndex = null;
  } else if (mode === "poseSolve") {
    manualDraftLine = null;
    manualDragPointerId = null;
    manualAnchorHoveredVertex = null;
    manualAnchorSelectedIndex = null;
    manualAnchorSelectedInput = "";
    manualEditHoveredLineIndex = null;
    manualEditSelectedLineIndex = null;
    if (!vertexSolveRenderData) {
      vertexSolveRenderData = runVertexSolveAndBuildData();
    }
    vertexSolveHoveredVertexIndex = null;
  } else {
    manualAnchorHoveredVertex = null;
    manualAnchorSelectedIndex = null;
    manualAnchorSelectedInput = "";
    manualEditHoveredLineIndex = null;
    manualEditSelectedLineIndex = null;
    vertexSolveRenderData = null;
    vertexSolveHoveredVertexIndex = null;
  }
  renderCropResultFromCache();
}

function buildPoseSolveArgsFromCurrentStructure(): McvPoseSolveArgs | null {
  if (!cropResultCache) {
    return null;
  }
  return {
    width: cropResultCache.width,
    height: cropResultCache.height,
    lines: MCV_DATA.structure.lines.map((line) => ({
      from: {
        x: line.from.x,
        y: line.from.y,
        from: [...line.from.from],
        to: [...line.from.to],
        ...(line.from.anchor !== undefined ? { anchor: line.from.anchor } : {}),
        ...(line.from.vertex !== undefined ? { vertex: line.from.vertex } : {}),
      },
      to: {
        x: line.to.x,
        y: line.to.y,
        from: [...line.to.from],
        to: [...line.to.to],
        ...(line.to.anchor !== undefined ? { anchor: line.to.anchor } : {}),
        ...(line.to.vertex !== undefined ? { vertex: line.to.vertex } : {}),
      },
      axis: line.axis,
      ...(line.length !== undefined ? { length: line.length } : {}),
    })),
    vertices: MCV_DATA.structure.vertices.map((vertex) => ({
      from: [...vertex.from],
      to: [...vertex.to],
      ...(vertex.anchor !== undefined ? { anchor: vertex.anchor } : {}),
      ...(vertex.x !== undefined ? { x: vertex.x } : {}),
      ...(vertex.y !== undefined ? { y: vertex.y } : {}),
      ...(vertex.z !== undefined ? { z: vertex.z } : {}),
    })),
  };
}

async function runPoseSolveFromCurrentStructure(): Promise<void> {
  if (getManualInteractionMode() !== "poseSolve") {
    return;
  }
  const args = buildPoseSolveArgsFromCurrentStructure();
  if (!args) {
    poseSolveState = {
      status: "error",
      error: "No image is loaded",
    };
    renderCropResultFromCache();
    return;
  }
  const correspondences = buildPoseCorrespondencesFromStructure(args.lines, args.vertices);
  if (correspondences.length < 4) {
    poseSolveState = {
      status: "error",
      error: "Need at least 4 solved structure vertices with world coordinates (x, y, z)",
    };
    renderCropResultFromCache();
    return;
  }

  const token = ++poseSolveRunToken;
  poseSolveState = { status: "running" };
  renderCropResultFromCache();
  try {
    const result = await runPoseSolve(args);
    if (token !== poseSolveRunToken || getManualInteractionMode() !== "poseSolve") {
      return;
    }
    poseSolveState = {
      status: "done",
      result,
    };
  } catch (error) {
    if (token !== poseSolveRunToken || getManualInteractionMode() !== "poseSolve") {
      return;
    }
    poseSolveState = {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
  renderCropResultFromCache();
}

function buildAnchorInputFromAnchor(anchor: StructureAnchor): string {
  const values: number[] = [];
  if (anchor.x !== undefined) {
    values.push(anchor.x);
  }
  if (anchor.y !== undefined) {
    values.push(anchor.y);
  }
  if (anchor.z !== undefined) {
    values.push(anchor.z);
  }
  return values.map((value) => String(value)).join(", ");
}

function buildAnchorLabelFromInput(input: string): string {
  return `(${input})`;
}

function getAnchorLabel(anchor: StructureAnchor, index: number): string {
  if (manualAnchorSelectedIndex === index) {
    return buildAnchorLabelFromInput(manualAnchorSelectedInput);
  }
  return buildAnchorLabelFromInput(buildAnchorInputFromAnchor(anchor));
}

function setManualAnchorSelection(index: number | null): void {
  manualAnchorSelectedIndex = index;
  if (index === null) {
    manualAnchorSelectedInput = "";
    return;
  }
  const anchor = MCV_DATA.structure.anchors[index];
  manualAnchorSelectedInput = anchor ? buildAnchorInputFromAnchor(anchor) : "";
}

function updateSelectedAnchorCoordinatesFromInput(): void {
  if (manualAnchorSelectedIndex === null) {
    return;
  }
  const anchor = MCV_DATA.structure.anchors[manualAnchorSelectedIndex];
  if (!anchor) {
    setManualAnchorSelection(null);
    return;
  }
  const tokens = manualAnchorSelectedInput.length > 0 ? manualAnchorSelectedInput.split(", ") : [];
  const parsed: Array<number | undefined> = [undefined, undefined, undefined];
  for (let i = 0; i < Math.min(3, tokens.length); i += 1) {
    const token = tokens[i];
    if (/^-?\d+$/.test(token)) {
      parsed[i] = Number.parseInt(token, 10);
    } else {
      parsed[i] = undefined;
    }
  }
  if (parsed[0] !== undefined) {
    anchor.x = parsed[0];
  } else {
    delete anchor.x;
  }
  if (parsed[1] !== undefined) {
    anchor.y = parsed[1];
  } else {
    delete anchor.y;
  }
  if (parsed[2] !== undefined) {
    anchor.z = parsed[2];
  } else {
    delete anchor.z;
  }
  const vertex = MCV_DATA.structure.vertices[anchor.vertex];
  if (vertex) {
    if (anchor.x !== undefined) {
      vertex.x = anchor.x;
    } else {
      delete vertex.x;
    }
    if (anchor.y !== undefined) {
      vertex.y = anchor.y;
    } else {
      delete vertex.y;
    }
    if (anchor.z !== undefined) {
      vertex.z = anchor.z;
    } else {
      delete vertex.z;
    }
  }
  markAnnotationsDirty();
}

function tryHandleAnchorInputKey(event: KeyboardEvent): boolean {
  if (manualAnchorSelectedIndex === null) {
    return false;
  }
  if (event.key === " ") {
    event.preventDefault();
    return true;
  }
  if (event.key === "Backspace") {
    event.preventDefault();
    if (manualAnchorSelectedInput.endsWith(", ")) {
      manualAnchorSelectedInput = manualAnchorSelectedInput.slice(0, -2);
    } else {
      manualAnchorSelectedInput = manualAnchorSelectedInput.slice(0, -1);
    }
    updateSelectedAnchorCoordinatesFromInput();
    renderCropResultFromCache();
    return true;
  }
  if (event.key === ",") {
    event.preventDefault();
    if (manualAnchorSelectedInput.length === 0) {
      return true;
    }
    const tokens = manualAnchorSelectedInput.split(", ");
    if (tokens.length >= 3) {
      return true;
    }
    const lastToken = tokens[tokens.length - 1];
    if (!/^-?\d+$/.test(lastToken)) {
      return true;
    }
    manualAnchorSelectedInput += ", ";
    updateSelectedAnchorCoordinatesFromInput();
    renderCropResultFromCache();
    return true;
  }
  if (event.key === "-") {
    event.preventDefault();
    const tokenStart = manualAnchorSelectedInput.lastIndexOf(", ") + 2;
    const currentToken = manualAnchorSelectedInput.slice(tokenStart);
    if (currentToken.length === 0) {
      manualAnchorSelectedInput += "-";
      updateSelectedAnchorCoordinatesFromInput();
      renderCropResultFromCache();
    }
    return true;
  }
  if (/^[0-9]$/.test(event.key)) {
    event.preventDefault();
    const tokens = manualAnchorSelectedInput.length > 0 ? manualAnchorSelectedInput.split(", ") : [];
    if (tokens.length <= 3) {
      manualAnchorSelectedInput += event.key;
      updateSelectedAnchorCoordinatesFromInput();
      renderCropResultFromCache();
    }
    return true;
  }
  return false;
}

function getStructureEndpointById(endpointId: number): StructureEndpoint | null {
  const lineIndex = Math.floor(endpointId / 2);
  const endpointType = endpointId % 2 === 0 ? "from" : "to";
  const line = MCV_DATA.structure.lines[lineIndex];
  if (!line) {
    return null;
  }
  return line[endpointType];
}

function collectStructureVertices(): StructureVertex[] {
  const lines = MCV_DATA.structure.lines;
  const endpointCount = lines.length * 2;
  if (endpointCount === 0) {
    return [];
  }
  const adjacency = Array.from({ length: endpointCount }, () => new Set<number>());
  const connect = (a: number, b: number) => {
    if (a === b || a < 0 || b < 0 || a >= endpointCount || b >= endpointCount) {
      return;
    }
    adjacency[a].add(b);
    adjacency[b].add(a);
  };
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const fromId = lineIndex * 2;
    const toId = fromId + 1;
    line.from.from.forEach((otherIndex) => connect(fromId, otherIndex * 2));
    line.from.to.forEach((otherIndex) => connect(fromId, otherIndex * 2 + 1));
    line.to.from.forEach((otherIndex) => connect(toId, otherIndex * 2));
    line.to.to.forEach((otherIndex) => connect(toId, otherIndex * 2 + 1));
  }

  const visited = new Array<boolean>(endpointCount).fill(false);
  const vertices: StructureVertex[] = [];
  for (let start = 0; start < endpointCount; start += 1) {
    if (visited[start]) {
      continue;
    }
    const stack = [start];
    const endpointIds: number[] = [];
    visited[start] = true;
    while (stack.length > 0) {
      const current = stack.pop()!;
      endpointIds.push(current);
      adjacency[current].forEach((next) => {
        if (!visited[next]) {
          visited[next] = true;
          stack.push(next);
        }
      });
    }
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    const lineIndexSet = new Set<number>();
    endpointIds.forEach((endpointId) => {
      const endpoint = getStructureEndpointById(endpointId);
      if (!endpoint) {
        return;
      }
      sumX += endpoint.x;
      sumY += endpoint.y;
      count += 1;
      lineIndexSet.add(Math.floor(endpointId / 2));
    });
    if (count > 0) {
      vertices.push({
        endpointIds: endpointIds.slice().sort((a, b) => a - b),
        point: { x: sumX / count, y: sumY / count },
        lineIndexes: Array.from(lineIndexSet).sort((a, b) => a - b),
      });
    }
  }
  return vertices;
}

function getAnchorEndpointIds(anchor: StructureAnchor): number[] {
  const ids = new Set<number>();
  anchor.from.forEach((lineIndex) => ids.add(lineIndex * 2));
  anchor.to.forEach((lineIndex) => ids.add(lineIndex * 2 + 1));
  return Array.from(ids).sort((a, b) => a - b);
}

function getAnchorPoint(anchor: StructureAnchor): ManualPoint | null {
  const endpointIds = getAnchorEndpointIds(anchor);
  if (endpointIds.length === 0) {
    return null;
  }
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  endpointIds.forEach((endpointId) => {
    const endpoint = getStructureEndpointById(endpointId);
    if (!endpoint) {
      return;
    }
    sumX += endpoint.x;
    sumY += endpoint.y;
    count += 1;
  });
  if (count === 0) {
    return null;
  }
  return { x: sumX / count, y: sumY / count };
}

function getAnchorLinkedLineIndexes(anchor: StructureAnchor): Set<number> {
  const indexes = new Set<number>();
  anchor.from.forEach((lineIndex) => indexes.add(lineIndex));
  anchor.to.forEach((lineIndex) => indexes.add(lineIndex));
  return indexes;
}

function areSortedArraysEqual(first: number[], second: number[]): boolean {
  if (first.length !== second.length) {
    return false;
  }
  for (let i = 0; i < first.length; i += 1) {
    if (first[i] !== second[i]) {
      return false;
    }
  }
  return true;
}

function findAnchorByLinks(from: number[], to: number[]): number {
  const sortedFrom = Array.from(new Set(from)).sort((a, b) => a - b);
  const sortedTo = Array.from(new Set(to)).sort((a, b) => a - b);
  for (let index = 0; index < MCV_DATA.structure.anchors.length; index += 1) {
    const anchor = MCV_DATA.structure.anchors[index];
    if (
      areSortedArraysEqual(sortedFrom, anchor.from) &&
      areSortedArraysEqual(sortedTo, anchor.to)
    ) {
      return index;
    }
  }
  return -1;
}

function getAnchorPointerHitRadiusInImagePixels(): number {
  if (!cropResultCache) {
    return 4;
  }
  const svg = getViewerCropResultSvgNode();
  const rect = svg?.getBoundingClientRect();
  if (!rect || rect.width <= 0) {
    return 4;
  }
  return Math.max(3, (8 * cropResultCache.width) / rect.width);
}

function findNearestAnchorIndex(point: ManualPoint): number {
  const threshold = getAnchorPointerHitRadiusInImagePixels();
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < MCV_DATA.structure.anchors.length; index += 1) {
    const anchorPoint = getAnchorPoint(MCV_DATA.structure.anchors[index]);
    if (!anchorPoint) {
      continue;
    }
    const distance = Math.hypot(anchorPoint.x - point.x, anchorPoint.y - point.y);
    if (distance <= threshold && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function updateAnchorHoverFromClient(clientX: number, clientY: number): void {
  if (!cropResultCache || getManualInteractionMode() !== "anchor") {
    if (manualAnchorHoveredVertex !== null) {
      manualAnchorHoveredVertex = null;
      renderCropResultFromCache();
    }
    return;
  }
  const point = getCropPointFromClient(clientX, clientY, cropResultCache.width, cropResultCache.height);
  if (!point) {
    if (manualAnchorHoveredVertex !== null) {
      manualAnchorHoveredVertex = null;
      renderCropResultFromCache();
    }
    return;
  }
  const next = findNearestStructureVertex(point);
  if (!next) {
    if (manualAnchorHoveredVertex !== null) {
      manualAnchorHoveredVertex = null;
      renderCropResultFromCache();
    }
    return;
  }
  const changed =
    !manualAnchorHoveredVertex ||
    !areSortedArraysEqual(manualAnchorHoveredVertex.endpointIds, next.endpointIds);
  if (changed) {
    manualAnchorHoveredVertex = next;
    renderCropResultFromCache();
  }
}

function findNearestStructureVertex(point: ManualPoint): StructureVertex | null {
  const vertices = collectStructureVertices();
  if (vertices.length === 0) {
    return null;
  }
  let best: StructureVertex | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  vertices.forEach((vertex) => {
    const distance = Math.hypot(vertex.point.x - point.x, vertex.point.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = vertex;
    }
  });
  return best;
}

function purgeGeneratedVerticesKeepingAnchors(): void {
  const retainedVertices: StructureVertexData[] = [];
  MCV_DATA.structure.anchors.forEach((anchor, anchorIndex) => {
    const vertex = MCV_DATA.structure.vertices[anchor.vertex];
    if (vertex) {
      retainedVertices.push({
        ...vertex,
        from: normalizeLineRefs(vertex.from),
        to: normalizeLineRefs(vertex.to),
        anchor: anchorIndex,
      });
    } else {
      retainedVertices.push({
        from: normalizeLineRefs(anchor.from),
        to: normalizeLineRefs(anchor.to),
        ...(anchor.x !== undefined ? { x: anchor.x } : {}),
        ...(anchor.y !== undefined ? { y: anchor.y } : {}),
        ...(anchor.z !== undefined ? { z: anchor.z } : {}),
        anchor: anchorIndex,
      });
    }
    anchor.vertex = retainedVertices.length - 1;
  });
  MCV_DATA.structure.vertices = retainedVertices;
  syncStructureEndpointRefs();
}

function getAnchorSeedCoord(anchor: StructureAnchor): VertexSolveCoord {
  const coord: VertexSolveCoord = {};
  if (anchor.x !== undefined) {
    coord.x = anchor.x;
  }
  if (anchor.y !== undefined) {
    coord.y = anchor.y;
  }
  if (anchor.z !== undefined) {
    coord.z = anchor.z;
  }
  return coord;
}

function hasAnyCoord(coord: VertexSolveCoord): boolean {
  return coord.x !== undefined || coord.y !== undefined || coord.z !== undefined;
}

function mergeCoordIntoTarget(target: VertexSolveCoord, next: VertexSolveCoord): "none" | "updated" | "conflict" {
  let changed = false;
  const mergeAxis = (key: keyof VertexSolveCoord) => {
    const value = next[key];
    if (value === undefined) {
      return;
    }
    const current = target[key];
    if (current === undefined) {
      target[key] = value;
      changed = true;
      return;
    }
    if (current !== value) {
      changed = false;
      throw new Error("conflict");
    }
  };
  try {
    mergeAxis("x");
    mergeAxis("y");
    mergeAxis("z");
  } catch {
    return "conflict";
  }
  return changed ? "updated" : "none";
}

function findTopologyVertexIndexForAnchor(
  anchor: StructureAnchor,
  topologyVertices: StructureVertex[]
): number {
  const endpointIds = getAnchorEndpointIds(anchor);
  if (endpointIds.length === 0) {
    return -1;
  }
  for (let index = 0; index < topologyVertices.length; index += 1) {
    if (areSortedArraysEqual(endpointIds, topologyVertices[index].endpointIds)) {
      return index;
    }
  }
  for (let index = 0; index < topologyVertices.length; index += 1) {
    const ids = topologyVertices[index].endpointIds;
    if (endpointIds.every((id) => ids.includes(id))) {
      return index;
    }
  }
  return -1;
}

function inferNeighborCoord(
  current: VertexSolveCoord,
  axis: ManualAxis,
  length: number,
  forward: boolean
): VertexSolveCoord {
  const sign = forward ? 1 : -1;
  const next: VertexSolveCoord = {};
  if (current.x !== undefined) {
    next.x = axis === "x" ? current.x + sign * length : current.x;
  }
  if (current.y !== undefined) {
    next.y = axis === "y" ? current.y + sign * length : current.y;
  }
  if (current.z !== undefined) {
    next.z = axis === "z" ? current.z + sign * length : current.z;
  }
  return next;
}

function runVertexSolveAndBuildData(): VertexSolveRenderData {
  const topologyVertices = collectStructureVertices();
  const endpointToVertex = new Map<number, number>();
  topologyVertices.forEach((vertex, vertexIndex) => {
    vertex.endpointIds.forEach((endpointId) => {
      endpointToVertex.set(endpointId, vertexIndex);
    });
  });

  const lineEdges: Array<{
    lineIndex: number;
    fromVertex: number;
    toVertex: number;
    axis: ManualAxis;
    length: number;
  }> = [];
  MCV_DATA.structure.lines.forEach((line, lineIndex) => {
    if (line.length === undefined || line.length <= 0) {
      return;
    }
    const fromVertex = endpointToVertex.get(lineIndex * 2);
    const toVertex = endpointToVertex.get(lineIndex * 2 + 1);
    if (fromVertex === undefined || toVertex === undefined || fromVertex === toVertex) {
      return;
    }
    lineEdges.push({
      lineIndex,
      fromVertex,
      toVertex,
      axis: line.axis,
      length: line.length,
    });
  });

  const adjacency = new Map<number, Array<(typeof lineEdges)[number]>>();
  lineEdges.forEach((edge) => {
    const fromList = adjacency.get(edge.fromVertex);
    if (fromList) {
      fromList.push(edge);
    } else {
      adjacency.set(edge.fromVertex, [edge]);
    }
    const toList = adjacency.get(edge.toVertex);
    if (toList) {
      toList.push(edge);
    } else {
      adjacency.set(edge.toVertex, [edge]);
    }
  });

  const coords: VertexSolveCoord[] = Array.from({ length: topologyVertices.length }, () => ({}));
  const queue: number[] = [];
  const inQueue = new Set<number>();
  const generatedVertexIndexes = new Set<number>();
  const anchorVertexIndexes = new Set<number>();
  const traversedLineIndexes = new Set<number>();
  let conflictVertexIndex: number | null = null;
  let conflictCoordPair: { existing: VertexSolveCoord; inferred: VertexSolveCoord } | null = null;

  const anchorToTopologyIndex: number[] = [];
  MCV_DATA.structure.anchors.forEach((anchor, anchorIndex) => {
    const topoIndex = findTopologyVertexIndexForAnchor(anchor, topologyVertices);
    anchorToTopologyIndex[anchorIndex] = topoIndex;
    if (topoIndex >= 0) {
      anchorVertexIndexes.add(topoIndex);
      generatedVertexIndexes.add(topoIndex);
      const merge = mergeCoordIntoTarget(coords[topoIndex], getAnchorSeedCoord(anchor));
      if (merge === "conflict" && conflictVertexIndex === null) {
        conflictVertexIndex = topoIndex;
        conflictCoordPair = {
          existing: { ...coords[topoIndex] },
          inferred: { ...getAnchorSeedCoord(anchor) },
        };
      }
      if (hasAnyCoord(coords[topoIndex]) && !inQueue.has(topoIndex)) {
        queue.push(topoIndex);
        inQueue.add(topoIndex);
      }
    }
  });

  while (queue.length > 0 && conflictVertexIndex === null) {
    const currentVertex = queue.shift()!;
    inQueue.delete(currentVertex);
    const currentCoord = coords[currentVertex];
    const edges = adjacency.get(currentVertex) || [];
    for (const edge of edges) {
      traversedLineIndexes.add(edge.lineIndex);
      const forward = edge.fromVertex === currentVertex;
      const nextVertex = forward ? edge.toVertex : edge.fromVertex;
      const inferred = inferNeighborCoord(currentCoord, edge.axis, edge.length, forward);
      generatedVertexIndexes.add(nextVertex);
      const merge = mergeCoordIntoTarget(coords[nextVertex], inferred);
      if (merge === "conflict") {
        conflictVertexIndex = nextVertex;
        conflictCoordPair = {
          existing: { ...coords[nextVertex] },
          inferred: { ...inferred },
        };
        break;
      }
      if (merge === "updated" && !inQueue.has(nextVertex)) {
        queue.push(nextVertex);
        inQueue.add(nextVertex);
      }
    }
  }

  const newVertices: StructureVertexData[] = [];
  MCV_DATA.structure.anchors.forEach((anchor, anchorIndex) => {
    const topoIndex = anchorToTopologyIndex[anchorIndex];
    const topo = topoIndex >= 0 ? topologyVertices[topoIndex] : null;
    const coord = topoIndex >= 0 ? coords[topoIndex] : {};
    const nextVertex: StructureVertexData = {
      from: normalizeLineRefs(topo ? topo.endpointIds.filter((id) => id % 2 === 0).map((id) => Math.floor(id / 2)) : anchor.from),
      to: normalizeLineRefs(topo ? topo.endpointIds.filter((id) => id % 2 === 1).map((id) => Math.floor(id / 2)) : anchor.to),
      anchor: anchorIndex,
      ...(coord.x !== undefined ? { x: coord.x } : anchor.x !== undefined ? { x: anchor.x } : {}),
      ...(coord.y !== undefined ? { y: coord.y } : anchor.y !== undefined ? { y: anchor.y } : {}),
      ...(coord.z !== undefined ? { z: coord.z } : anchor.z !== undefined ? { z: anchor.z } : {}),
    };
    newVertices.push(nextVertex);
    anchor.vertex = newVertices.length - 1;
    if (nextVertex.x !== undefined) {
      anchor.x = nextVertex.x;
    } else {
      delete anchor.x;
    }
    if (nextVertex.y !== undefined) {
      anchor.y = nextVertex.y;
    } else {
      delete anchor.y;
    }
    if (nextVertex.z !== undefined) {
      anchor.z = nextVertex.z;
    } else {
      delete anchor.z;
    }
  });

  topologyVertices.forEach((topo, topoIndex) => {
    if (!generatedVertexIndexes.has(topoIndex)) {
      return;
    }
    if (anchorVertexIndexes.has(topoIndex)) {
      return;
    }
    const coord = coords[topoIndex];
    newVertices.push({
      from: normalizeLineRefs(topo.endpointIds.filter((id) => id % 2 === 0).map((id) => Math.floor(id / 2))),
      to: normalizeLineRefs(topo.endpointIds.filter((id) => id % 2 === 1).map((id) => Math.floor(id / 2))),
      ...(coord.x !== undefined ? { x: coord.x } : {}),
      ...(coord.y !== undefined ? { y: coord.y } : {}),
      ...(coord.z !== undefined ? { z: coord.z } : {}),
    });
  });

  MCV_DATA.structure.vertices = newVertices;
  syncStructureEndpointRefs();

  return {
    traversedLineIndexes,
    generatedVertexIndexes,
    anchorVertexIndexes,
    conflictVertexIndex,
    conflictCoordPair,
    topologyCoords: coords.map((coord) => ({ ...coord })),
    topologyVertices,
  };
}

function getCurrentLinesForDisplay(): Array<ManualAnnotation | StructureLine> {
  return renderAnnotationPreviewHeld ? MCV_DATA.annotations : MCV_DATA.structure.lines;
}

function getDistancePointToSegment(point: ManualPoint, segment: McvLineSegment): number {
  const x1 = segment[0];
  const y1 = segment[1];
  const x2 = segment[2];
  const y2 = segment[3];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    return Math.hypot(point.x - x1, point.y - y1);
  }
  const t = Math.max(0, Math.min(1, ((point.x - x1) * dx + (point.y - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

function findClosestDisplayedLineIndex(point: ManualPoint): number {
  const lines = getCurrentLinesForDisplay();
  if (lines.length === 0) {
    return -1;
  }
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  lines.forEach((line, index) => {
    const distance = getDistancePointToSegment(point, getLineSegmentForLine(line));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function updateEditHoverFromClient(clientX: number, clientY: number): void {
  if (!cropResultCache || getManualInteractionMode() !== "edit") {
    if (manualEditHoveredLineIndex !== null) {
      manualEditHoveredLineIndex = null;
      renderCropResultFromCache();
    }
    return;
  }
  const point = getCropPointFromClient(clientX, clientY, cropResultCache.width, cropResultCache.height);
  const next = point ? findClosestDisplayedLineIndex(point) : -1;
  const nextValue = next >= 0 ? next : null;
  if (manualEditHoveredLineIndex !== nextValue) {
    manualEditHoveredLineIndex = nextValue;
    renderCropResultFromCache();
  }
}

function updateVertexSolveHoverFromClient(clientX: number, clientY: number): void {
  if (!cropResultCache || getManualInteractionMode() !== "vertexSolve") {
    if (vertexSolveHoveredVertexIndex !== null) {
      vertexSolveHoveredVertexIndex = null;
      renderCropResultFromCache();
    }
    return;
  }
  const solveData = vertexSolveRenderData ?? (vertexSolveRenderData = runVertexSolveAndBuildData());
  const point = getCropPointFromClient(clientX, clientY, cropResultCache.width, cropResultCache.height);
  if (!point || !solveData || solveData.topologyVertices.length === 0) {
    if (vertexSolveHoveredVertexIndex !== null) {
      vertexSolveHoveredVertexIndex = null;
      renderCropResultFromCache();
    }
    return;
  }
  let bestIndex: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  solveData.topologyVertices.forEach((vertex, index) => {
    const distance = Math.hypot(vertex.point.x - point.x, vertex.point.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  if (vertexSolveHoveredVertexIndex !== bestIndex) {
    vertexSolveHoveredVertexIndex = bestIndex;
    renderCropResultFromCache();
  }
}

function swapAnchorEndpointForLine(lineIndex: number): void {
  MCV_DATA.structure.anchors.forEach((anchor) => {
    const hasFrom = anchor.from.includes(lineIndex);
    const hasTo = anchor.to.includes(lineIndex);
    if (hasFrom) {
      anchor.from = anchor.from.filter((value) => value !== lineIndex);
    }
    if (hasTo) {
      anchor.to = anchor.to.filter((value) => value !== lineIndex);
    }
    if (hasFrom) {
      anchor.to.push(lineIndex);
    }
    if (hasTo) {
      anchor.from.push(lineIndex);
    }
    anchor.from = Array.from(new Set(anchor.from)).sort((a, b) => a - b);
    anchor.to = Array.from(new Set(anchor.to)).sort((a, b) => a - b);
  });
  MCV_DATA.structure.vertices.forEach((vertex) => {
    const hasFrom = vertex.from.includes(lineIndex);
    const hasTo = vertex.to.includes(lineIndex);
    if (hasFrom) {
      vertex.from = vertex.from.filter((value) => value !== lineIndex);
    }
    if (hasTo) {
      vertex.to = vertex.to.filter((value) => value !== lineIndex);
    }
    if (hasFrom) {
      vertex.to.push(lineIndex);
    }
    if (hasTo) {
      vertex.from.push(lineIndex);
    }
    vertex.from = normalizeLineRefs(vertex.from);
    vertex.to = normalizeLineRefs(vertex.to);
  });
}

function adjustSelectedLineLength(delta: number): void {
  if (manualEditSelectedLineIndex === null) {
    return;
  }
  const line = MCV_DATA.annotations[manualEditSelectedLineIndex];
  if (!line) {
    manualEditSelectedLineIndex = null;
    return;
  }
  const current = line.length ?? 0;
  const next = Math.max(0, current + delta);
  if (next > 0) {
    line.length = next;
  } else {
    delete line.length;
  }
  const structureLine = MCV_DATA.structure.lines[manualEditSelectedLineIndex];
  if (structureLine) {
    if (next > 0) {
      structureLine.length = next;
    } else {
      delete structureLine.length;
    }
  }
  markAnnotationsDirty();
  renderCropResultFromCache();
}

function flipSelectedLineDirection(): void {
  if (manualEditSelectedLineIndex === null) {
    return;
  }
  const line = MCV_DATA.annotations[manualEditSelectedLineIndex];
  if (!line) {
    manualEditSelectedLineIndex = null;
    return;
  }
  const nextFrom = { x: line.to.x, y: line.to.y };
  const nextTo = { x: line.from.x, y: line.from.y };
  line.from = nextFrom;
  line.to = nextTo;
  swapAnchorEndpointForLine(manualEditSelectedLineIndex);
  rebuildStructureFromAnnotations();
  markAnnotationsDirty();
  renderCropResultFromCache();
}

function updateSelectedLineAxis(axis: ManualAxis, startsBackwards: boolean): void {
  if (manualEditSelectedLineIndex === null) {
    return;
  }
  const line = MCV_DATA.annotations[manualEditSelectedLineIndex];
  if (!line) {
    manualEditSelectedLineIndex = null;
    return;
  }
  line.axis = axis;
  if (startsBackwards) {
    const nextFrom = { x: line.to.x, y: line.to.y };
    const nextTo = { x: line.from.x, y: line.from.y };
    line.from = nextFrom;
    line.to = nextTo;
    swapAnchorEndpointForLine(manualEditSelectedLineIndex);
  }
  rebuildStructureFromAnnotations();
  markAnnotationsDirty();
  renderCropResultFromCache();
}

function removeAnchorAtIndex(anchorIndex: number): void {
  if (anchorIndex < 0 || anchorIndex >= MCV_DATA.structure.anchors.length) {
    return;
  }
  const removedAnchor = MCV_DATA.structure.anchors[anchorIndex];
  const removedVertexIndex = removedAnchor.vertex;
  MCV_DATA.structure.anchors.splice(anchorIndex, 1);
  if (removedVertexIndex >= 0 && removedVertexIndex < MCV_DATA.structure.vertices.length) {
    MCV_DATA.structure.vertices.splice(removedVertexIndex, 1);
  }
  MCV_DATA.structure.anchors.forEach((anchor, index) => {
    if (anchor.vertex > removedVertexIndex) {
      anchor.vertex -= 1;
    }
    const vertex = MCV_DATA.structure.vertices[anchor.vertex];
    if (vertex) {
      vertex.anchor = index;
    }
  });
  MCV_DATA.structure.vertices.forEach((vertex) => {
    if (vertex.anchor !== undefined) {
      if (vertex.anchor === anchorIndex) {
        delete vertex.anchor;
      } else if (vertex.anchor > anchorIndex) {
        vertex.anchor -= 1;
      }
    }
  });
  if (manualAnchorSelectedIndex !== null) {
    if (manualAnchorSelectedIndex === anchorIndex) {
      manualAnchorSelectedIndex = null;
      manualAnchorSelectedInput = "";
    } else if (manualAnchorSelectedIndex > anchorIndex) {
      manualAnchorSelectedIndex -= 1;
    }
  }
  syncStructureEndpointRefs();
  markAnnotationsDirty();
  renderCropResultFromCache();
}

function removeLineAtIndex(lineIndex: number): void {
  if (lineIndex < 0 || lineIndex >= MCV_DATA.annotations.length) {
    return;
  }
  MCV_DATA.annotations.splice(lineIndex, 1);
  rebuildAnchorsAndVerticesAfterLineRemoval(lineIndex);
  if (manualEditSelectedLineIndex !== null) {
    if (manualEditSelectedLineIndex === lineIndex) {
      manualEditSelectedLineIndex = null;
    } else if (manualEditSelectedLineIndex > lineIndex) {
      manualEditSelectedLineIndex -= 1;
    }
  }
  if (manualEditHoveredLineIndex !== null) {
    if (manualEditHoveredLineIndex === lineIndex) {
      manualEditHoveredLineIndex = null;
    } else if (manualEditHoveredLineIndex > lineIndex) {
      manualEditHoveredLineIndex -= 1;
    }
  }
  manualRedoLines.length = 0;
  rebuildStructureFromAnnotations();
  markAnnotationsDirty();
  renderCropResultFromCache();
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

  const anchorMode = getManualInteractionMode() === "anchor";
  const editMode = getManualInteractionMode() === "edit";
  const vertexSolveMode = getManualInteractionMode() === "vertexSolve";
  const solveData = vertexSolveMode
    ? (vertexSolveRenderData ?? (vertexSolveRenderData = runVertexSolveAndBuildData()))
    : null;
  const potentialLinkIndexes = manualDraftLine ? getDraftPotentialLinkIndexes(manualDraftLine) : new Set<number>();
  const linesToRender: Array<ManualAnnotation | StructureLine> = getCurrentLinesForDisplay();

  const anchorLightIndexes = new Set<number>();
  if (anchorMode) {
    if (manualAnchorHoveredVertex) {
      manualAnchorHoveredVertex.lineIndexes.forEach((lineIndex) => {
        anchorLightIndexes.add(lineIndex);
      });
    }
    if (manualAnchorSelectedIndex !== null) {
      const selectedAnchor = MCV_DATA.structure.anchors[manualAnchorSelectedIndex];
      if (selectedAnchor) {
        getAnchorLinkedLineIndexes(selectedAnchor).forEach((lineIndex) => {
          anchorLightIndexes.add(lineIndex);
        });
      }
    }
  }

  linesToRender.forEach((line, index) => {
    const editHighlighted =
      editMode && (manualEditHoveredLineIndex === index || manualEditSelectedLineIndex === index);
    const axisColor =
      vertexSolveMode
        ? solveData && solveData.traversedLineIndexes.has(index)
          ? "#5dff74"
          : "#ffffff"
        : (anchorMode && anchorLightIndexes.has(index)) || editHighlighted
        ? getAxisLightColor(line.axis)
        : potentialLinkIndexes.has(index)
          ? getAxisLightColor(line.axis)
          : getAxisColor(line.axis);
    const segment = getLineSegmentForLine(line);
    appendSvgLine(
      sceneGroup,
      segment,
      axisColor,
      2,
      1,
      anchorMode || vertexSolveMode ? undefined : getAxisMarkerId(line.axis)
    );
    if (!anchorMode && !vertexSolveMode) {
      appendSvgLineLabel(sceneGroup, segment, line.length, axisColor);
    }
  });
  if (!anchorMode && !vertexSolveMode && manualDraftLine) {
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

  if (anchorMode) {
    MCV_DATA.structure.anchors.forEach((anchor, index) => {
      const point = getAnchorPoint(anchor);
      if (!point) {
        return;
      }
      const selected = manualAnchorSelectedIndex === index;
      appendSvgPointDot(sceneGroup, point, selected ? "#5ca8ff" : "#ffffff", 2.2);
      appendSvgAnchorLabel(
        sceneGroup,
        point,
        getAnchorLabel(anchor, index),
        selected ? "#5ca8ff" : "#ffffff"
      );
    });
    if (manualAnchorHoveredVertex) {
      appendSvgPointDot(sceneGroup, manualAnchorHoveredVertex.point, "#ffe46b", 2.8);
    }
  }
  if (vertexSolveMode && solveData) {
    MCV_DATA.structure.anchors.forEach((anchor) => {
      const point = getAnchorPoint(anchor);
      if (point) {
        appendSvgPointDot(sceneGroup, point, "#5dff74", 2.6);
      }
    });
    solveData.generatedVertexIndexes.forEach((vertexIndex) => {
      const vertex = solveData.topologyVertices[vertexIndex];
      if (vertex) {
        appendSvgPointDot(sceneGroup, vertex.point, "#5dff74", 2.4);
      }
    });
    if (solveData.conflictVertexIndex !== null) {
      const conflict = solveData.topologyVertices[solveData.conflictVertexIndex];
      if (conflict) {
        appendSvgPointDot(sceneGroup, conflict.point, "#ff4d4d", 3.2);
      }
    }
    if (
      vertexSolveHoveredVertexIndex !== null &&
      vertexSolveHoveredVertexIndex >= 0 &&
      vertexSolveHoveredVertexIndex < solveData.topologyVertices.length
    ) {
      const hoveredPoint = solveData.topologyVertices[vertexSolveHoveredVertexIndex].point;
      let labelText = formatVertexSolveCoordTuple(
        solveData.topologyCoords[vertexSolveHoveredVertexIndex] ?? {}
      );
      if (
        solveData.conflictVertexIndex !== null &&
        vertexSolveHoveredVertexIndex === solveData.conflictVertexIndex &&
        solveData.conflictCoordPair
      ) {
        labelText = `${formatVertexSolveCoordTuple(solveData.conflictCoordPair.existing)} vs ${formatVertexSolveCoordTuple(solveData.conflictCoordPair.inferred)}`;
      }
      appendSvgAnchorLabel(sceneGroup, hoveredPoint, labelText, "#ffe46b");
    }
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

    if (anchorMode) {
      const nearestVertex = findNearestStructureVertex(point);
      manualAnchorHoveredVertex = nearestVertex;
      const existingAnchorIndex = findNearestAnchorIndex(point);
      if (existingAnchorIndex >= 0) {
        setManualAnchorSelection(existingAnchorIndex);
        event.preventDefault();
        renderCropResultFromCache();
        return;
      }
      if (!manualAnchorHoveredVertex) {
        setManualAnchorSelection(null);
        event.preventDefault();
        renderCropResultFromCache();
        return;
      }
      const from = Array.from(
        new Set(
          manualAnchorHoveredVertex.endpointIds
            .filter((endpointId) => endpointId % 2 === 0)
            .map((endpointId) => Math.floor(endpointId / 2))
        )
      ).sort((a, b) => a - b);
      const to = Array.from(
        new Set(
          manualAnchorHoveredVertex.endpointIds
            .filter((endpointId) => endpointId % 2 === 1)
            .map((endpointId) => Math.floor(endpointId / 2))
        )
      ).sort((a, b) => a - b);
      const existingIndex = findAnchorByLinks(from, to);
      if (existingIndex >= 0) {
        setManualAnchorSelection(existingIndex);
      } else {
        const createdIndex = createAnchorWithVertex(from, to);
        syncStructureEndpointRefs();
        setManualAnchorSelection(createdIndex);
        markAnnotationsDirty();
      }
      event.preventDefault();
      renderCropResultFromCache();
      return;
    }
    if (vertexSolveMode) {
      event.preventDefault();
      return;
    }
    if (editMode) {
      const nearestLineIndex = findClosestDisplayedLineIndex(point);
      manualEditHoveredLineIndex = nearestLineIndex >= 0 ? nearestLineIndex : null;
      manualEditSelectedLineIndex = nearestLineIndex >= 0 ? nearestLineIndex : null;
      event.preventDefault();
      renderCropResultFromCache();
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
    if (!cropResultCache || event.ctrlKey || viewerCtrlHeld || anchorMode || vertexSolveMode) {
      return;
    }
    event.preventDefault();
    if (editMode) {
      adjustSelectedLineLength(1);
    } else {
      adjustDraftEdgeLength(1);
    }
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
  const availableWidth = Math.max(120, window.innerWidth - 24);
  const availableHeight = Math.max(120, window.innerHeight - 24);
  const scale = Math.max(0.01, Math.min(availableWidth / width, availableHeight / height));
  element.style.width = `${Math.floor(width * scale)}px`;
  element.style.height = `${Math.floor(height * scale)}px`;
}

function renderCropResultFromCache(): void {
  const imageStage = getViewerFullImageStageNode();
  if (!cropResultCache) {
    removePoseSolvePanel();
    if (imageStage) {
      imageStage.classList.add("hidden");
    }
    return;
  }
  if (getManualInteractionMode() === "poseSolve") {
    hideViewerCropResult();
    if (imageStage) {
      imageStage.classList.add("hidden");
    }
    renderPoseSolvePanel();
    return;
  }
  removePoseSolvePanel();
  if (imageStage) {
    imageStage.classList.remove("hidden");
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

  if (getManualInteractionMode() === "anchor") {
    updateAnchorHoverFromClient(pointer.clientX, pointer.clientY);
    return;
  }
  if (getManualInteractionMode() === "edit") {
    updateEditHoverFromClient(pointer.clientX, pointer.clientY);
    return;
  }
  if (getManualInteractionMode() === "vertexSolve") {
    updateVertexSolveHoverFromClient(pointer.clientX, pointer.clientY);
    return;
  }
  if (getManualInteractionMode() === "poseSolve") {
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

function splitSecondsAndFrames(secondsValue: number): { seconds: number; frames: number } {
  const safe = Math.max(0, Number.isFinite(secondsValue) ? secondsValue : 0);
  const seconds = Math.floor(safe);
  const fractional = safe - seconds;
  const frames = Math.max(0, Math.min(VIEWER_FPS - 1, Math.floor(fractional * VIEWER_FPS + 1e-6)));
  return { seconds, frames };
}

function buildMcvSourceFromViewer(viewer: ViewerMedia): McvDataSource | null {
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
      const { seconds, frames } = splitSecondsAndFrames(viewer.initialSeekSeconds);
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

function resolveVideoViewerFromSource(source: McvDataSource): ViewerMedia | null {
  if (source.type !== "video") {
    return null;
  }
  if (!("id" in source) || !("url" in source)) {
    return null;
  }
  const byId = findMediaById(source.id);
  if (byId && byId.kind === "video") {
    return byId;
  }
  if (source.youtube_id) {
    const byYoutube = findVideoByYoutubeId(source.youtube_id);
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
    const byUrl = findMediaByNormalizedUrl(normalizedSourceUrl);
    if (byUrl && byUrl.kind === "video") {
      return byUrl;
    }
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

function isSvgFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === "image/svg+xml" || name.endsWith(".svg");
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file text"));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  });
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(blob);
  });
}

async function ensureEmbeddedImageDataUrl(source: string): Promise<string> {
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

function createSvgLayer(
  svg: SVGSVGElement,
  label: string,
  visible: boolean
): SVGGElement {
  const svgNs = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(svgNs, "g");
  g.setAttribute("inkscape:groupmode", "layer");
  g.setAttribute("inkscape:label", label);
  if (!visible) {
    g.setAttribute("style", "display:none");
  }
  svg.appendChild(g);
  return g;
}

function renderLinesToLayer(
  layer: SVGGElement,
  lines: Array<ManualAnnotation | StructureLine>,
  includeArrows: boolean,
  includeLengths: boolean
): void {
  lines.forEach((line) => {
    const color = getAxisColor(line.axis);
    const segment = getLineSegmentForLine(line);
    appendSvgLine(layer, segment, color, 2, 1, includeArrows ? getAxisMarkerId(line.axis) : undefined);
    if (includeLengths) {
      appendSvgLineLabel(layer, segment, line.length, color);
    }
  });
}

function getVertexDotPoint(vertex: StructureVertexData): ManualPoint | null {
  const endpointIds = [
    ...vertex.from.map((lineIndex) => lineIndex * 2),
    ...vertex.to.map((lineIndex) => lineIndex * 2 + 1),
  ];
  if (endpointIds.length === 0) {
    return null;
  }
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  endpointIds.forEach((endpointId) => {
    const endpoint = getStructureEndpointById(endpointId);
    if (!endpoint) {
      return;
    }
    sumX += endpoint.x;
    sumY += endpoint.y;
    count += 1;
  });
  if (count === 0) {
    return null;
  }
  return { x: sumX / count, y: sumY / count };
}

function normalizeImportedAxis(value: unknown): ManualAxis | null {
  return value === "x" || value === "y" || value === "z" ? value : null;
}

function normalizeImportedSource(value: unknown): McvDataSource | undefined {
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

function normalizeImportedLineRefs(value: unknown, maxLines: number): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return normalizeLineRefs(
    value
      .map((item) => (typeof item === "number" && Number.isInteger(item) ? item : -1))
      .filter((index) => index >= 0 && index < maxLines)
  );
}

function normalizeImportedMcvData(value: unknown): {
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
    for (const raw of structure!.vertices as unknown[]) {
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
    for (const raw of structure!.anchors as unknown[]) {
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

function applyImportedMcvState(data: {
  annotations: ManualAnnotation[];
  anchors: StructureAnchor[];
  vertices: StructureVertexData[];
  source?: McvDataSource;
}): void {
  MCV_DATA.annotations = data.annotations.map((line) => ({
    from: { x: line.from.x, y: line.from.y },
    to: { x: line.to.x, y: line.to.y },
    axis: line.axis,
    ...(line.length !== undefined ? { length: line.length } : {}),
  }));
  MCV_DATA.structure.anchors = data.anchors.map((anchor) => ({
    from: normalizeLineRefs(anchor.from),
    to: normalizeLineRefs(anchor.to),
    vertex: anchor.vertex,
    ...(anchor.x !== undefined ? { x: anchor.x } : {}),
    ...(anchor.y !== undefined ? { y: anchor.y } : {}),
    ...(anchor.z !== undefined ? { z: anchor.z } : {}),
  }));
  MCV_DATA.structure.vertices = data.vertices.map((vertex) => ({
    from: normalizeLineRefs(vertex.from),
    to: normalizeLineRefs(vertex.to),
    ...(vertex.anchor !== undefined ? { anchor: vertex.anchor } : {}),
    ...(vertex.x !== undefined ? { x: vertex.x } : {}),
    ...(vertex.y !== undefined ? { y: vertex.y } : {}),
    ...(vertex.z !== undefined ? { z: vertex.z } : {}),
  }));
  if (data.source) {
    MCV_DATA.source = { ...data.source };
  } else {
    delete MCV_DATA.source;
  }
  rebuildStructureFromAnnotations();
  manualRedoLines.length = 0;
  manualDraftLine = null;
  manualDragPointerId = null;
  manualDragClientX = 0;
  manualDragClientY = 0;
  manualAxisSelection = "x";
  manualAxisStartsBackwards = false;
  manualInteractionMode = "draw";
  manualAnchorSelectedIndex = null;
  manualAnchorSelectedInput = "";
  manualAnchorHoveredVertex = null;
  manualEditHoveredLineIndex = null;
  manualEditSelectedLineIndex = null;
  vertexSolveRenderData = null;
  poseSolveState = null;
  poseSolveRunToken += 1;
  renderAnnotationPreviewHeld = false;
  clearAnnotationsDirty();
}

async function tryLoadMcvSvgFile(file: File): Promise<{ imageDataUrl: string; data: unknown } | null> {
  const text = await readFileAsText(file);
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "image/svg+xml");
  if (!doc.querySelector("parsererror")) {
    const scriptNode = doc.querySelector("script#mcv-data") ?? doc.querySelector("script[type='application/json']");
    const imageNode =
      doc.querySelector("image[data-role='mcv-base-image']") ??
      doc.querySelector("image");
    const href =
      imageNode?.getAttribute("href") ||
      imageNode?.getAttribute("xlink:href") ||
      imageNode?.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    if (scriptNode?.textContent && href) {
      try {
        const data = JSON.parse(scriptNode.textContent.trim());
        return {
          imageDataUrl: href,
          data,
        };
      } catch {
        // Fall through to robust text fallback.
      }
    }
  }

  const scriptMatch =
    text.match(/<script[^>]*id=["']mcv-data["'][^>]*>([\s\S]*?)<\/script>/i) ||
    text.match(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i);
  const imageMatch =
    text.match(/<image[^>]*data-role=["']mcv-base-image["'][^>]*\s(?:href|xlink:href)=["']([^"']+)["'][^>]*>/i) ||
    text.match(/<image[^>]*\s(?:href|xlink:href)=["']([^"']+)["'][^>]*>/i);
  if (!scriptMatch || !imageMatch) {
    return null;
  }
  try {
    const data = JSON.parse(scriptMatch[1].trim());
    return {
      imageDataUrl: imageMatch[1],
      data,
    };
  } catch {
    return null;
  }
}

async function saveCurrentStateAsSvg(): Promise<void> {
  if (!cropResultCache || !viewerMedia) {
    return;
  }
  const width = cropResultCache.width;
  const height = cropResultCache.height;
  const imageDataUrl = await ensureEmbeddedImageDataUrl(cropResultCache.colorDataUrl);
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("xmlns", svgNs);
  svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  svg.setAttribute("xmlns:inkscape", "http://www.inkscape.org/namespaces/inkscape");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  appendAxisMarkers(svg);

  const baseLayer = createSvgLayer(svg, "base", true);
  const baseImage = document.createElementNS(svgNs, "image");
  baseImage.setAttribute("data-role", "mcv-base-image");
  baseImage.setAttribute("href", imageDataUrl);
  baseImage.setAttribute("x", "0");
  baseImage.setAttribute("y", "0");
  baseImage.setAttribute("width", String(width));
  baseImage.setAttribute("height", String(height));
  baseImage.setAttribute("preserveAspectRatio", "none");
  baseLayer.appendChild(baseImage);

  const annotationLayer = createSvgLayer(svg, "annotation", false);
  renderLinesToLayer(annotationLayer, MCV_DATA.annotations, true, true);

  const structureLayer = createSvgLayer(svg, "structure", true);
  renderLinesToLayer(structureLayer, MCV_DATA.structure.lines, true, true);

  const anchorsLayer = createSvgLayer(svg, "anchors", false);
  MCV_DATA.structure.anchors.forEach((anchor, index) => {
    const point = getAnchorPoint(anchor);
    if (!point) {
      return;
    }
    appendSvgPointDot(anchorsLayer, point, "#5dff74", 2.4);
    appendSvgAnchorLabel(anchorsLayer, point, getAnchorLabel(anchor, index), "#5dff74");
  });

  const includeVerticesLayer =
    getManualInteractionMode() === "vertexSolve" &&
    vertexSolveRenderData !== null &&
    vertexSolveRenderData.conflictVertexIndex === null;
  if (includeVerticesLayer) {
    const verticesLayer = createSvgLayer(svg, "vertices", false);
    MCV_DATA.structure.vertices.forEach((vertex) => {
      const point = getVertexDotPoint(vertex);
      if (!point) {
        return;
      }
      appendSvgPointDot(verticesLayer, point, "#5dff74", 2.2);
    });
  }

  const script = document.createElementNS(svgNs, "script");
  script.setAttribute("id", "mcv-data");
  script.setAttribute("type", "application/json");
  script.textContent = JSON.stringify(MCV_DATA);
  svg.appendChild(script);

  const serializer = new XMLSerializer();
  const serialized = serializer.serializeToString(svg);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const download = document.createElement("a");
  download.href = objectUrl;
  const safeTitle = viewerMedia.title.replace(/[^\w.-]+/g, "_");
  download.download = `${safeTitle || "mcv"}_state.svg`;
  document.body.appendChild(download);
  download.click();
  document.body.removeChild(download);
  URL.revokeObjectURL(objectUrl);
  clearAnnotationsDirty();
}

async function handleUploadedFile(file: File): Promise<void> {
  selectedUploadFilename = file.name;
  pendingImportedMcvState = null;
  pendingImportedVideoSourceForImageLoad = null;
  if (isSvgFile(file)) {
    try {
      const parsed = await tryLoadMcvSvgFile(file);
      if (parsed) {
        const normalized = normalizeImportedMcvData(parsed.data);
        if (normalized) {
          pendingImportedMcvState = normalized;
          if (normalized.source?.type === "video") {
            pendingImportedVideoSourceForImageLoad = normalized.source;
          }
          openViewer({
            tab: "upload",
            id: "upload-file",
            kind: "image",
            title: file.name,
            url: parsed.imageDataUrl,
            isObjectUrl: false,
          });
          return;
        }
      }
    } catch {
      // Fall back to standard file loading below.
    }
  }
  const objectUrl = URL.createObjectURL(file);
  openViewer({
    tab: "upload",
    id: "upload-file",
    kind: inferMediaKindFromFile(file),
    title: file.name,
    url: objectUrl,
    isObjectUrl: true,
  });
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
  if (!viewerVideoNode || !viewerActiveVideoContext) {
    return { seconds: 0, frame: 0 };
  }
  const safeTime = Math.max(0, Number.isFinite(viewerVideoNode.currentTime) ? viewerVideoNode.currentTime : 0);
  const wholeSeconds = Math.floor(safeTime);
  const fractional = safeTime - wholeSeconds;
  const frame = Math.max(0, Math.min(VIEWER_FPS - 1, Math.floor(fractional * VIEWER_FPS + 1e-6)));
  return { seconds: wholeSeconds, frame };
}

function updateMcvSourceVideoTimestampFromCurrentViewer(): void {
  if (!viewerActiveVideoContext || viewerActiveVideoContext.kind !== "video") {
    return;
  }
  const { seconds, frame } = getCurrentViewerTimeParts();
  if (viewerActiveVideoContext.id === "upload-file") {
    MCV_DATA.source = {
      type: "video",
      filename: viewerActiveVideoContext.title,
      seconds,
      frames: frame,
    };
    return;
  }
  if (!MCV_DATA.source || MCV_DATA.source.type !== "video") {
    return;
  }
  if (!("id" in MCV_DATA.source) || !("url" in MCV_DATA.source)) {
    return;
  }
  const sameVideo =
    MCV_DATA.source.id === viewerActiveVideoContext.id ||
    (MCV_DATA.source.youtube_id && viewerActiveVideoContext.youtubeId
      ? MCV_DATA.source.youtube_id === viewerActiveVideoContext.youtubeId
      : false) ||
    normalizePossibleUrl(MCV_DATA.source.url) === normalizePossibleUrl(viewerActiveVideoContext.url);
  if (!sameVideo) {
    return;
  }
  MCV_DATA.source.seconds = seconds;
  MCV_DATA.source.frames = frame;
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
  const context = viewerActiveVideoContext;
  if (!context) {
    return null;
  }
  const shareUrl = getShareBaseUrl();
  shareUrl.hash = "";
  shareUrl.search = "";

  const { seconds, frame } = getCurrentViewerTimeParts();
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
  if (!viewerActiveVideoContext?.youtubeId) {
    return null;
  }
  const { seconds } = getCurrentViewerTimeParts();
  const ytUrl = new URL("https://www.youtube.com/watch");
  ytUrl.searchParams.set("v", viewerActiveVideoContext.youtubeId);
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

function renderVideoViewerUi(
  contentNode: HTMLDivElement,
  videoContext: ViewerMedia,
  options?: {
    containerRole?: string;
    sourceLabel?: string;
  }
): void {
  if (options?.containerRole) {
    const existing = contentNode.querySelector(`[data-role="${options.containerRole}"]`);
    if (existing) {
      existing.remove();
    }
  }

  const panel = document.createElement("div");
  panel.className = "viewer-video-panel";
  if (options?.containerRole) {
    panel.setAttribute("data-role", options.containerRole);
  }
  if (options?.sourceLabel) {
    const sourceLabel = document.createElement("div");
    sourceLabel.className = "time-label";
    sourceLabel.textContent = options.sourceLabel;
    panel.appendChild(sourceLabel);
  }

  const videoNode = document.createElement("video");
  videoNode.className = "viewer-video";
  videoNode.controls = true;
  videoNode.preload = "metadata";
  videoNode.crossOrigin = "anonymous";
  videoNode.src = videoContext.url;
  panel.appendChild(videoNode);

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

  if (videoContext.youtubeId) {
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
  activeAnalyzeButton = analyzeButton;

  hmsRow.appendChild(hmsLabel);
  hmsRow.appendChild(hmsInputRow);

  controlsNode.appendChild(hmsRow);
  panel.appendChild(controlsNode);

  viewerActiveVideoContext = videoContext;
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

  if (videoContext.timestampLabel) {
    hmsInput.value = videoContext.timestampLabel;
  }
  videoNode.addEventListener("loadedmetadata", () => {
    if (viewerVideoNode !== videoNode) {
      return;
    }
    if (videoContext.initialSeekSeconds !== undefined) {
      videoNode.currentTime = clampVideoTime(videoNode, videoContext.initialSeekSeconds);
      videoContext.initialSeekSeconds = undefined;
    }
    syncViewerTimeInputs(true);
  });

  syncViewerTimeInputs(true);
  contentNode.appendChild(panel);
  refreshUnsavedActionUi();
}

function mountImportedSourceVideoForCurrentImage(source: McvDataSource, attempt = 0): void {
  if (!viewerMedia || viewerMedia.kind !== "image") {
    return;
  }
  const viewerContent = getViewerContentNode();
  if (!viewerContent) {
    return;
  }
  const linkedVideo = resolveVideoViewerFromSource(source);
  if (!linkedVideo) {
    if (mediaLoadState === "fetching" && attempt < 12) {
      window.setTimeout(() => {
        mountImportedSourceVideoForCurrentImage(source, attempt + 1);
      }, 250);
    }
    return;
  }
  if (source.seconds !== undefined || source.frames !== undefined) {
    linkedVideo.initialSeekSeconds = Math.max(0, source.seconds ?? 0) + Math.max(0, source.frames ?? 0) / VIEWER_FPS;
    linkedVideo.timestampLabel = `${formatTimestamp(Math.max(0, source.seconds ?? 0))}|${Math.max(0, source.frames ?? 0)}`;
  }
  renderVideoViewerUi(viewerContent, linkedVideo, {
    containerRole: "linked-video-source",
    sourceLabel: `Source video: ${linkedVideo.title}`,
  });
}

function getAnalyzedFrameTitle(): string {
  const { seconds, frame } = getCurrentViewerTimeParts();
  const sourceTitle = viewerActiveVideoContext?.title ? ` from ${viewerActiveVideoContext.title}` : "";
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
  if (hasUnsavedChanges && !analyzeOverwriteArmed) {
    analyzeOverwriteArmed = true;
    backDiscardArmed = false;
    refreshUnsavedActionUi();
    return;
  }
  analyzeOverwriteArmed = false;
  refreshUnsavedActionUi();

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
    updateMcvSourceVideoTimestampFromCurrentViewer();
    const frameObjectUrl = await captureViewerFrameObjectUrl();
    revokeAnalyzedImageObjectUrl();
    currentAnalyzedImageObjectUrl = frameObjectUrl;
    showViewerFullImage(frameObjectUrl, getAnalyzedFrameTitle());
    setLabel("Analyze!");
    clearAnnotationsDirty();
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
  viewerActiveVideoContext = null;
  activeAnalyzeButton = null;
  pendingImportedVideoSourceForImageLoad = null;
  clearViewerFullImage();
  revokeAnalyzedImageObjectUrl();
  revokeViewerObjectUrl();
  setViewerMode(false);
  refreshUnsavedActionUi();
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
  activeAnalyzeButton = null;
  viewerVideoNode = null;
  viewerHmsInput = null;
  viewerEditingField = null;
  viewerActiveVideoContext = null;
  refreshUnsavedActionUi();

  if (viewerMedia.kind === "image") {
    clearMediaError();
    showViewerFullImage(viewerMedia.url, viewerMedia.title);
    setViewerMode(true);
    return;
  }

  clearViewerFullImage();
  renderVideoViewerUi(contentNode, viewerMedia);
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
  const source = buildMcvSourceFromViewer(nextViewer);
  if (source) {
    MCV_DATA.source = source;
  } else {
    delete MCV_DATA.source;
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
      void handleUploadedFile(file);
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
  const target = event.target as HTMLElement | null;
  const targetIsEditable =
    !!target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable);

  if (cropResultCache && !targetIsEditable) {
    if (event.ctrlKey && !event.shiftKey && (event.key === "s" || event.key === "S")) {
      event.preventDefault();
      void saveCurrentStateAsSvg();
      return;
    }
    if (event.key === "a" || event.key === "A") {
      event.preventDefault();
      setManualInteractionMode("anchor");
      return;
    }
    if (event.key === "s" || event.key === "S") {
      event.preventDefault();
      setManualInteractionMode("vertexSolve");
      return;
    }
    if (event.key === "d" || event.key === "D") {
      if (
        getManualInteractionMode() === "vertexSolve" &&
        vertexSolveRenderData &&
        vertexSolveRenderData.conflictVertexIndex === null
      ) {
        event.preventDefault();
        setManualInteractionMode("poseSolve");
        void runPoseSolveFromCurrentStructure();
        return;
      }
      if (getManualInteractionMode() === "poseSolve") {
        event.preventDefault();
        void runPoseSolveFromCurrentStructure();
        return;
      }
    }
    if (
      (event.key === "4" || event.code === "Numpad4") &&
      !(getManualInteractionMode() === "anchor" && manualAnchorSelectedIndex !== null)
    ) {
      event.preventDefault();
      setManualInteractionMode("edit");
      return;
    }

    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      if (getManualInteractionMode() === "anchor") {
        setManualAnchorSelection(null);
      } else if (getManualInteractionMode() === "edit") {
        manualEditSelectedLineIndex = null;
      } else if (getManualInteractionMode() === "vertexSolve") {
        // keep solve view active until explicit mode change
      } else if (getManualInteractionMode() === "poseSolve") {
        // keep solve view active until explicit mode change
      } else if (manualDraftLine) {
        manualDraftLine = null;
        manualDragPointerId = null;
      }
      renderCropResultFromCache();
      return;
    }

    if (getManualInteractionMode() === "anchor" && tryHandleAnchorInputKey(event)) {
      return;
    }
    if (event.key === "Delete") {
      if (getManualInteractionMode() === "anchor") {
        event.preventDefault();
        if (manualAnchorSelectedIndex !== null) {
          removeAnchorAtIndex(manualAnchorSelectedIndex);
        }
        return;
      }
      if (getManualInteractionMode() === "edit") {
        event.preventDefault();
        if (manualEditSelectedLineIndex !== null) {
          removeLineAtIndex(manualEditSelectedLineIndex);
        }
        return;
      }
    }

    if (event.ctrlKey && !event.shiftKey && (event.key === "z" || event.key === "Z")) {
      if (
        getManualInteractionMode() === "anchor" ||
        getManualInteractionMode() === "edit" ||
        getManualInteractionMode() === "vertexSolve" ||
        getManualInteractionMode() === "poseSolve"
      ) {
        return;
      }
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
      if (
        getManualInteractionMode() === "anchor" ||
        getManualInteractionMode() === "edit" ||
        getManualInteractionMode() === "vertexSolve" ||
        getManualInteractionMode() === "poseSolve"
      ) {
        return;
      }
      event.preventDefault();
      const restored = manualRedoLines.pop();
      if (restored) {
        pushAnnotationWithStructureLink(restored);
      }
      renderCropResultFromCache();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "=" || event.key === "+") {
      if (
        getManualInteractionMode() === "anchor" ||
        getManualInteractionMode() === "vertexSolve" ||
        getManualInteractionMode() === "poseSolve"
      ) {
        return;
      }
      event.preventDefault();
      if (getManualInteractionMode() === "edit") {
        adjustSelectedLineLength(1);
      } else {
        adjustDraftEdgeLength(1);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "-" || event.key === "_") {
      if (
        getManualInteractionMode() === "anchor" ||
        getManualInteractionMode() === "vertexSolve" ||
        getManualInteractionMode() === "poseSolve"
      ) {
        return;
      }
      event.preventDefault();
      if (getManualInteractionMode() === "edit") {
        adjustSelectedLineLength(-1);
      } else {
        adjustDraftEdgeLength(-1);
      }
      return;
    }

    const applyAxisSelection = (axis: ManualAxis, startsBackwards: boolean) => {
      if (getManualInteractionMode() === "edit") {
        if (manualEditSelectedLineIndex === null) {
          setManualInteractionMode("draw");
          manualAxisSelection = axis;
          manualAxisStartsBackwards = startsBackwards;
          return;
        }
        updateSelectedLineAxis(axis, startsBackwards);
        return;
      }
      if (getManualInteractionMode() === "vertexSolve") {
        setManualInteractionMode("draw");
        manualAxisSelection = axis;
        manualAxisStartsBackwards = startsBackwards;
        return;
      }
      if (getManualInteractionMode() === "poseSolve") {
        setManualInteractionMode("draw");
        manualAxisSelection = axis;
        manualAxisStartsBackwards = startsBackwards;
        return;
      }
      if (getManualInteractionMode() === "anchor") {
        setManualInteractionMode("draw");
      }
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
      if (getManualInteractionMode() === "anchor") {
        return;
      }
      event.preventDefault();
      if (getManualInteractionMode() === "edit") {
        flipSelectedLineDirection();
        return;
      }
      manualDraftLine = {
        ...manualDraftLine,
        flipped: !manualDraftLine.flipped,
      };
      renderCropResultFromCache();
      return;
    }
    if (event.key === "Tab" && getManualInteractionMode() === "edit") {
      event.preventDefault();
      flipSelectedLineDirection();
      return;
    }
  }

  if (!viewerVideoNode || !viewerActiveVideoContext || viewerActiveVideoContext.kind !== "video") {
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
      if (hasUnsavedChanges && !backDiscardArmed) {
        backDiscardArmed = true;
        analyzeOverwriteArmed = false;
        refreshUnsavedActionUi();
        return;
      }
      backDiscardArmed = false;
      closeViewer();
      renderMediaBox();
    });
  }
  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedChanges) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });
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
        if (cropResultCache) {
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
        if (cropResultCache) {
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
      if (cropResultCache) {
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
        void handleUploadedFile(file);
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
