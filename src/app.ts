import * as Geometry from "./app/geometry";
import * as MediaUtils from "./app/mediaUtils";
import * as SvgUtils from "./app/svgUtils";
import * as ManualEditorController from "./app/controllers/manualEditorController";
import * as MediaController from "./app/controllers/mediaController";
import * as ViewerController from "./app/controllers/viewerController";
import {
  buildPoseCorrespondencesFromStructure as buildPoseCorrespondencesFromStructureImpl,
  createMcvClient,
} from "./app/mcvClient";
type McvOperation = "cv.poseSolve" | "cv.precomputeSobel" | "cv.clearCache" | "cv.opopRefineLine";

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

type McvPoseSolveArgs = {
  width: number;
  height: number;
  lines: StructureLine[];
  vertices: StructureVertexData[];
  initial_vfov_deg?: number;
};

type McvReprojectedLine = {
  line_index: number;
  from: {
    x: number;
    y: number;
  };
  to: {
    x: number;
    y: number;
  };
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
  reprojected_lines?: McvReprojectedLine[];
};

type McvOpopRefineLineResult = {
  from: ManualPoint;
  to: ManualPoint;
  points: ManualPoint[];
  whisker_count: number;
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
type ManualInteractionMode = "draw" | "anchor" | "edit" | "vertexSolve" | "poseSolve" | "reproject";
type OpopWhiskerMode = "per_pixel" | "per_line";
type OpopSettings = {
  enabled: boolean;
  alignmentStrength: number;
  straightnessStrength: number;
  whiskerMode: OpopWhiskerMode;
  whiskersPerPixel: number;
  whiskersPerLine: number;
  whiskerOpacityPercent: number;
  normalSearchRadiusPx: number;
  iterations: number;
  includeEndpoints: boolean;
  imageSmoothingEnabled: boolean;
};
type OpopLineAnimation = {
  axis: ManualAxis;
  startFrom: ManualPoint;
  startTo: ManualPoint;
  targetFrom: ManualPoint;
  targetTo: ManualPoint;
  whiskers: McvLineSegment[];
  points: ManualPoint[];
  startedAt: number;
  fadeStartedAt: number | null;
  overlayOpacity: number;
  whiskerOpacity: number;
  slideDurationMs: number;
  fadeDurationMs: number;
};
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
    runPoseSolve: typeof runPoseSolve;
    runOpopRefineLine: typeof runOpopRefineLine;
    prepareSobelCache: typeof prepareSobelCache;
    clearSobelCache: typeof clearSobelCache;
    opop: {
      getSettings: typeof getOpopSettings;
      setSettings: typeof setOpopSettings;
    };
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
let viewerDetectedFps: number | null = null;
let stopViewerFpsProbe: (() => void) | null = null;
let viewerImageRenderToken = 0;
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
const opopSettings: OpopSettings = {
  enabled: true,
  alignmentStrength: 1,
  straightnessStrength: 1,
  whiskerMode: "per_pixel",
  whiskersPerPixel: 4,
  whiskersPerLine: 128,
  whiskerOpacityPercent: 50,
  normalSearchRadiusPx: 2,
  iterations: 6,
  includeEndpoints: false,
  imageSmoothingEnabled: false,
};
const opopLineAnimations = new Map<number, OpopLineAnimation>();
const opopRefineTokenByLine = new Map<number, number>();
let opopAnimationRafId: number | null = null;
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
const VIEWER_FPS_FALLBACK = ViewerController.VIEWER_FPS_FALLBACK;
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

function getViewerFrameRate(): number {
  return ViewerController.getViewerFrameRate(viewerDetectedFps, VIEWER_FPS_FALLBACK);
}

function getViewerFrameDurationSeconds(): number {
  return ViewerController.getViewerFrameDurationSeconds(viewerDetectedFps, VIEWER_FPS_FALLBACK);
}

function getViewerFrameBase(): number {
  return ViewerController.getViewerFrameBase(viewerDetectedFps, VIEWER_FPS_FALLBACK);
}

function stopViewerFrameRateProbe(): void {
  if (stopViewerFpsProbe) {
    stopViewerFpsProbe();
    stopViewerFpsProbe = null;
  }
  viewerDetectedFps = null;
}

function startViewerFrameRateProbe(video: HTMLVideoElement): void {
  stopViewerFrameRateProbe();
  const stopFn = ViewerController.startViewerFrameRateProbe(video, (fps) => {
    viewerDetectedFps = fps;
  });
  stopViewerFpsProbe = stopFn || null;
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
      const from = Geometry.remapLineRefsAfterLineRemoval(anchor.from, removedLineIndex);
      const to = Geometry.remapLineRefsAfterLineRemoval(anchor.to, removedLineIndex);
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
    from: Geometry.remapLineRefsAfterLineRemoval(vertex.from, removedLineIndex),
    to: Geometry.remapLineRefsAfterLineRemoval(vertex.to, removedLineIndex),
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
      from: Geometry.normalizeLineRefs(vertexFrom.length > 0 ? vertexFrom : entry.anchor.from),
      to: Geometry.normalizeLineRefs(vertexTo.length > 0 ? vertexTo : entry.anchor.to),
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
      from: Geometry.normalizeLineRefs(vertex.from),
      to: Geometry.normalizeLineRefs(vertex.to),
    });
  });

  MCV_DATA.structure.anchors = keptAnchors.map((entry) => ({
    ...entry.anchor,
    from: Geometry.normalizeLineRefs(entry.anchor.from),
    to: Geometry.normalizeLineRefs(entry.anchor.to),
  }));
  MCV_DATA.structure.vertices = newVertices;
}

function createAnchorWithVertex(from: number[], to: number[]): number {
  const normalizedFrom = Geometry.normalizeLineRefs(from);
  const normalizedTo = Geometry.normalizeLineRefs(to);
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
        Geometry.getInfiniteLineIntersection(linesForSolve[0], linesForSolve[1]) ??
        Geometry.getLeastSquaresLinePoint(linesForSolve);
    } else {
      snapPoint = Geometry.getLeastSquaresLinePoint(linesForSolve);
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

  const threshold = Geometry.computeStructureLinkThreshold(MCV_DATA.annotations);
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
  opopLineAnimations.delete(removedIndex);
  opopRefineTokenByLine.delete(removedIndex);
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

function stopOpopAnimationLoop(): void {
  if (opopAnimationRafId !== null) {
    cancelAnimationFrame(opopAnimationRafId);
    opopAnimationRafId = null;
  }
}

function clearOpopOptimizedPoints(): void {
  opopLineAnimations.clear();
  opopRefineTokenByLine.clear();
  stopOpopAnimationLoop();
  clearOpopAnimationOverlay();
}

function remapOpopIndexesAfterLineRemoval(removedLineIndex: number): void {
  const remappedAnimations = new Map<number, OpopLineAnimation>();
  opopLineAnimations.forEach((animation, lineIndex) => {
    if (lineIndex === removedLineIndex) {
      return;
    }
    const nextIndex = lineIndex > removedLineIndex ? lineIndex - 1 : lineIndex;
    remappedAnimations.set(nextIndex, animation);
  });
  opopLineAnimations.clear();
  remappedAnimations.forEach((animation, lineIndex) => {
    opopLineAnimations.set(lineIndex, animation);
  });

  const remappedTokens = new Map<number, number>();
  opopRefineTokenByLine.forEach((token, lineIndex) => {
    if (lineIndex === removedLineIndex) {
      return;
    }
    const nextIndex = lineIndex > removedLineIndex ? lineIndex - 1 : lineIndex;
    remappedTokens.set(nextIndex, token);
  });
  opopRefineTokenByLine.clear();
  remappedTokens.forEach((token, lineIndex) => {
    opopRefineTokenByLine.set(lineIndex, token);
  });
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
  clearOpopOptimizedPoints();
  clearAnnotationsDirty();
}

const mcvRuntime = createMcvClient({
  backend: __MCV_BACKEND__,
  opencvUrl: __MCV_OPENCV_URL__,
  mediaApiUrl: __MCV_MEDIA_API_URL__,
  dataApiUrl: __MCV_DATA_API_URL__,
});

function buildPoseCorrespondencesFromStructure(
  lines: StructureLine[],
  vertices: StructureVertexData[]
): Array<{ image: [number, number]; world: [number, number, number] }> {
  return buildPoseCorrespondencesFromStructureImpl(lines, vertices);
}

function wrapDegrees180(angleDeg: number): number {
  return Geometry.wrapDegrees180(angleDeg);
}

async function runPoseSolve(args: McvPoseSolveArgs): Promise<McvPoseSolveResult> {
  return await mcvRuntime.runPoseSolve(args);
}

async function runOpopRefineLine(
  imageDataUrl: string,
  line: { from: ManualPoint; to: ManualPoint },
  settings: OpopSettings,
  dragLine?: { from: ManualPoint; to: ManualPoint }
): Promise<McvOpopRefineLineResult> {
  return await mcvRuntime.runOpopRefineLine(
    imageDataUrl,
    {
      from: { x: line.from.x, y: line.from.y },
      to: { x: line.to.x, y: line.to.y },
    },
    {
      alignmentStrength: settings.alignmentStrength,
      straightnessStrength: settings.straightnessStrength,
      whiskerMode: settings.whiskerMode,
      whiskersPerPixel: settings.whiskersPerPixel,
      whiskersPerLine: settings.whiskersPerLine,
      normalSearchRadiusPx: settings.normalSearchRadiusPx,
      iterations: settings.iterations,
      includeEndpoints: settings.includeEndpoints,
    },
    dragLine
      ? {
          from: { x: dragLine.from.x, y: dragLine.from.y },
          to: { x: dragLine.to.x, y: dragLine.to.y },
        }
      : undefined
  );
}

async function prepareSobelCache(imageDataUrl: string): Promise<void> {
  await mcvRuntime.prepareSobelCache(imageDataUrl);
}

async function clearSobelCache(reason: "viewer_exit" | "unload" = "viewer_exit"): Promise<void> {
  await mcvRuntime.clearSobelCache(reason);
}

async function callMcvApi<TData>(requestBody: McvRequest): Promise<McvResponse<TData>> {
  return await mcvRuntime.callMcvApi<TData>(requestBody);
}

async function fetchMediaApi(): Promise<Response> {
  return await mcvRuntime.fetchMediaApi();
}

function isMediaApiAvailable(): boolean {
  return mcvRuntime.isMediaApiAvailable();
}

function isDataApiAvailable(): boolean {
  return mcvRuntime.isDataApiAvailable();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getOpopSettings(): OpopSettings {
  return { ...opopSettings };
}

function setOpopSettings(patch: Partial<OpopSettings>): OpopSettings {
  let shouldRerender = false;
  if (patch.enabled !== undefined) {
    const nextEnabled = Boolean(patch.enabled);
    if (opopSettings.enabled !== nextEnabled) {
      opopSettings.enabled = nextEnabled;
      if (!nextEnabled) {
        clearOpopOptimizedPoints();
      }
      shouldRerender = true;
    }
  }
  if (patch.whiskerMode === "per_pixel" || patch.whiskerMode === "per_line") {
    if (opopSettings.whiskerMode !== patch.whiskerMode) {
      opopSettings.whiskerMode = patch.whiskerMode;
      shouldRerender = true;
    }
  }
  if (patch.alignmentStrength !== undefined && Number.isFinite(patch.alignmentStrength)) {
    const next = clampNumber(patch.alignmentStrength, 0, 5);
    if (opopSettings.alignmentStrength !== next) {
      opopSettings.alignmentStrength = next;
      shouldRerender = true;
    }
  }
  if (patch.straightnessStrength !== undefined && Number.isFinite(patch.straightnessStrength)) {
    const next = clampNumber(patch.straightnessStrength, 0, 5);
    if (opopSettings.straightnessStrength !== next) {
      opopSettings.straightnessStrength = next;
      shouldRerender = true;
    }
  }
  if (patch.whiskersPerPixel !== undefined && Number.isFinite(patch.whiskersPerPixel)) {
    const next = Math.round(clampNumber(patch.whiskersPerPixel, 1, 4096));
    if (opopSettings.whiskersPerPixel !== next || opopSettings.whiskersPerLine !== next) {
      opopSettings.whiskersPerPixel = next;
      opopSettings.whiskersPerLine = next;
      shouldRerender = true;
    }
  }
  if (patch.whiskersPerLine !== undefined && Number.isFinite(patch.whiskersPerLine)) {
    const next = Math.round(clampNumber(patch.whiskersPerLine, 1, 4096));
    if (opopSettings.whiskersPerPixel !== next || opopSettings.whiskersPerLine !== next) {
      opopSettings.whiskersPerPixel = next;
      opopSettings.whiskersPerLine = next;
      shouldRerender = true;
    }
  }
  if (patch.whiskerOpacityPercent !== undefined && Number.isFinite(patch.whiskerOpacityPercent)) {
    const next = Math.round(clampNumber(patch.whiskerOpacityPercent, 0, 100));
    if (opopSettings.whiskerOpacityPercent !== next) {
      opopSettings.whiskerOpacityPercent = next;
      shouldRerender = true;
    }
  }
  if (patch.normalSearchRadiusPx !== undefined && Number.isFinite(patch.normalSearchRadiusPx)) {
    const next = clampNumber(patch.normalSearchRadiusPx, 1, 128);
    if (opopSettings.normalSearchRadiusPx !== next) {
      opopSettings.normalSearchRadiusPx = next;
      shouldRerender = true;
    }
  }
  if (patch.iterations !== undefined && Number.isFinite(patch.iterations)) {
    const next = Math.round(clampNumber(patch.iterations, 1, 64));
    if (opopSettings.iterations !== next) {
      opopSettings.iterations = next;
      shouldRerender = true;
    }
  }
  if (patch.includeEndpoints !== undefined) {
    const next = Boolean(patch.includeEndpoints);
    if (opopSettings.includeEndpoints !== next) {
      opopSettings.includeEndpoints = next;
      shouldRerender = true;
    }
  }
  if (patch.imageSmoothingEnabled !== undefined) {
    const next = Boolean(patch.imageSmoothingEnabled);
    if (opopSettings.imageSmoothingEnabled !== next) {
      opopSettings.imageSmoothingEnabled = next;
      shouldRerender = true;
    }
  }
  if (shouldRerender && cropResultCache && getManualInteractionMode() !== "poseSolve") {
    renderCropResultFromCache();
  }
  refreshOpopSettingsUi();
  return getOpopSettings();
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
      runPoseSolve: runPoseSolve,
      runOpopRefineLine: runOpopRefineLine,
      prepareSobelCache: prepareSobelCache,
      clearSobelCache: clearSobelCache,
      opop: {
        getSettings: getOpopSettings,
        setSettings: setOpopSettings,
      },
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

function getOpopStageNode(): HTMLDivElement | null {
  return document.getElementById("opop-stage") as HTMLDivElement | null;
}

function getOpopEnabledInputNode(): HTMLInputElement | null {
  return document.getElementById("opop-enabled") as HTMLInputElement | null;
}

function getOpopAlignmentStrengthInputNode(): HTMLInputElement | null {
  return document.getElementById("opop-alignment-strength") as HTMLInputElement | null;
}

function getOpopAlignmentStrengthValueNode(): HTMLSpanElement | null {
  return document.getElementById("opop-alignment-strength-value") as HTMLSpanElement | null;
}

function getOpopStraightnessStrengthInputNode(): HTMLInputElement | null {
  return document.getElementById("opop-straightness-strength") as HTMLInputElement | null;
}

function getOpopStraightnessStrengthValueNode(): HTMLSpanElement | null {
  return document.getElementById("opop-straightness-strength-value") as HTMLSpanElement | null;
}

function getOpopWhiskerModeNode(): HTMLSelectElement | null {
  return document.getElementById("opop-whisker-mode") as HTMLSelectElement | null;
}

function getOpopWhiskerCountLabelNode(): HTMLSpanElement | null {
  return document.getElementById("opop-whisker-count-label") as HTMLSpanElement | null;
}

function getOpopWhiskerCountNode(): HTMLInputElement | null {
  return document.getElementById("opop-whisker-count") as HTMLInputElement | null;
}

function getOpopWhiskerOpacityInputNode(): HTMLInputElement | null {
  return document.getElementById("opop-whisker-opacity") as HTMLInputElement | null;
}

function getOpopWhiskerOpacityValueNode(): HTMLSpanElement | null {
  return document.getElementById("opop-whisker-opacity-value") as HTMLSpanElement | null;
}

function getOpopNormalSearchRadiusNode(): HTMLInputElement | null {
  return document.getElementById("opop-normal-search-radius") as HTMLInputElement | null;
}

function getOpopIterationsNode(): HTMLInputElement | null {
  return document.getElementById("opop-iterations") as HTMLInputElement | null;
}

function getOpopIncludeEndpointsNode(): HTMLInputElement | null {
  return document.getElementById("opop-include-endpoints") as HTMLInputElement | null;
}

function getOpopImageSmoothingEnabledNode(): HTMLInputElement | null {
  return document.getElementById("opop-image-smoothing-enabled") as HTMLInputElement | null;
}

function getViewerCropResultSvgNode(): SVGSVGElement | null {
  const cropResultNode = getViewerCropResultNode();
  if (!cropResultNode) {
    return null;
  }
  return cropResultNode.firstElementChild as SVGSVGElement | null;
}

function shouldShowOpopStage(): boolean {
  return cropResultCache !== null && getManualInteractionMode() !== "poseSolve";
}

function refreshOpopStageVisibility(): void {
  const opopStage = getOpopStageNode();
  if (!opopStage) {
    return;
  }
  opopStage.classList.toggle("hidden", !shouldShowOpopStage());
}

function refreshOpopSettingsUi(): void {
  const stageNode = getOpopStageNode();
  const enabledInput = getOpopEnabledInputNode();
  const alignmentInput = getOpopAlignmentStrengthInputNode();
  const alignmentValue = getOpopAlignmentStrengthValueNode();
  const straightnessInput = getOpopStraightnessStrengthInputNode();
  const straightnessValue = getOpopStraightnessStrengthValueNode();
  const whiskerModeInput = getOpopWhiskerModeNode();
  const whiskerCountLabel = getOpopWhiskerCountLabelNode();
  const whiskerCountInput = getOpopWhiskerCountNode();
  const whiskerOpacityInput = getOpopWhiskerOpacityInputNode();
  const whiskerOpacityValue = getOpopWhiskerOpacityValueNode();
  const normalSearchRadiusInput = getOpopNormalSearchRadiusNode();
  const iterationsInput = getOpopIterationsNode();
  const includeEndpointsInput = getOpopIncludeEndpointsNode();
  const imageSmoothingEnabledInput = getOpopImageSmoothingEnabledNode();
  if (
    !stageNode ||
    !enabledInput ||
    !alignmentInput ||
    !alignmentValue ||
    !straightnessInput ||
    !straightnessValue ||
    !whiskerModeInput ||
    !whiskerCountLabel ||
    !whiskerCountInput ||
    !whiskerOpacityInput ||
    !whiskerOpacityValue ||
    !normalSearchRadiusInput ||
    !iterationsInput ||
    !includeEndpointsInput ||
    !imageSmoothingEnabledInput
  ) {
    return;
  }

  enabledInput.checked = opopSettings.enabled;
  alignmentInput.value = opopSettings.alignmentStrength.toFixed(2);
  alignmentValue.textContent = opopSettings.alignmentStrength.toFixed(2);
  straightnessInput.value = opopSettings.straightnessStrength.toFixed(2);
  straightnessValue.textContent = opopSettings.straightnessStrength.toFixed(2);
  whiskerModeInput.value = opopSettings.whiskerMode;
  whiskerCountLabel.textContent =
    opopSettings.whiskerMode === "per_pixel" ? "Pixels per whisker" : "Whiskers per line";
  whiskerCountInput.value = String(
    opopSettings.whiskerMode === "per_pixel" ? opopSettings.whiskersPerPixel : opopSettings.whiskersPerLine
  );
  whiskerOpacityInput.value = String(opopSettings.whiskerOpacityPercent);
  whiskerOpacityValue.textContent = `${opopSettings.whiskerOpacityPercent}%`;
  normalSearchRadiusInput.value = opopSettings.normalSearchRadiusPx.toFixed(1);
  iterationsInput.value = String(opopSettings.iterations);
  includeEndpointsInput.checked = opopSettings.includeEndpoints;
  imageSmoothingEnabledInput.checked = opopSettings.imageSmoothingEnabled;

  const disabled = !opopSettings.enabled;
  alignmentInput.disabled = disabled;
  straightnessInput.disabled = disabled;
  whiskerModeInput.disabled = disabled;
  whiskerCountInput.disabled = disabled;
  whiskerOpacityInput.disabled = disabled;
  normalSearchRadiusInput.disabled = disabled;
  iterationsInput.disabled = disabled;
  includeEndpointsInput.disabled = disabled;

  stageNode.classList.toggle("opop-disabled", disabled);
  refreshOpopStageVisibility();
}

function installOpopUiHandlers(): void {
  const stageNode = getOpopStageNode();
  const enabledInput = getOpopEnabledInputNode();
  const alignmentInput = getOpopAlignmentStrengthInputNode();
  const straightnessInput = getOpopStraightnessStrengthInputNode();
  const whiskerModeInput = getOpopWhiskerModeNode();
  const whiskerCountInput = getOpopWhiskerCountNode();
  const whiskerOpacityInput = getOpopWhiskerOpacityInputNode();
  const normalSearchRadiusInput = getOpopNormalSearchRadiusNode();
  const iterationsInput = getOpopIterationsNode();
  const includeEndpointsInput = getOpopIncludeEndpointsNode();
  const imageSmoothingEnabledInput = getOpopImageSmoothingEnabledNode();
  if (
    !stageNode ||
    !enabledInput ||
    !alignmentInput ||
    !straightnessInput ||
    !whiskerModeInput ||
    !whiskerCountInput ||
    !whiskerOpacityInput ||
    !normalSearchRadiusInput ||
    !iterationsInput ||
    !includeEndpointsInput ||
    !imageSmoothingEnabledInput
  ) {
    return;
  }
  if (stageNode.dataset.opopBound === "true") {
    refreshOpopSettingsUi();
    return;
  }
  stageNode.dataset.opopBound = "true";

  enabledInput.addEventListener("change", () => {
    setOpopSettings({ enabled: enabledInput.checked });
  });
  alignmentInput.addEventListener("input", () => {
    const value = Number(alignmentInput.value);
    if (Number.isFinite(value)) {
      setOpopSettings({ alignmentStrength: value });
    }
  });
  straightnessInput.addEventListener("input", () => {
    const value = Number(straightnessInput.value);
    if (Number.isFinite(value)) {
      setOpopSettings({ straightnessStrength: value });
    }
  });
  whiskerModeInput.addEventListener("change", () => {
    const nextMode = whiskerModeInput.value === "per_line" ? "per_line" : "per_pixel";
    setOpopSettings({ whiskerMode: nextMode });
  });
  whiskerCountInput.addEventListener("change", () => {
    const value = Number(whiskerCountInput.value);
    if (Number.isFinite(value)) {
      if (opopSettings.whiskerMode === "per_pixel") {
        setOpopSettings({ whiskersPerPixel: value });
      } else {
        setOpopSettings({ whiskersPerLine: value });
      }
    } else {
      refreshOpopSettingsUi();
    }
  });
  whiskerOpacityInput.addEventListener("input", () => {
    const value = Number(whiskerOpacityInput.value);
    if (Number.isFinite(value)) {
      setOpopSettings({ whiskerOpacityPercent: value });
    }
  });
  normalSearchRadiusInput.addEventListener("change", () => {
    const value = Number(normalSearchRadiusInput.value);
    if (Number.isFinite(value)) {
      setOpopSettings({ normalSearchRadiusPx: value });
    } else {
      refreshOpopSettingsUi();
    }
  });
  iterationsInput.addEventListener("change", () => {
    const value = Number(iterationsInput.value);
    if (Number.isFinite(value)) {
      setOpopSettings({ iterations: value });
    } else {
      refreshOpopSettingsUi();
    }
  });
  includeEndpointsInput.addEventListener("change", () => {
    setOpopSettings({ includeEndpoints: includeEndpointsInput.checked });
  });
  imageSmoothingEnabledInput.addEventListener("change", () => {
    setOpopSettings({ imageSmoothingEnabled: imageSmoothingEnabledInput.checked });
  });

  refreshOpopSettingsUi();
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
  viewerImageRenderToken += 1;
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
  stopViewerFrameRateProbe();
  refreshOpopStageVisibility();
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
  const renderToken = ++viewerImageRenderToken;
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
  image.onload = async () => {
    if (renderToken !== viewerImageRenderToken) {
      return;
    }
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width > 0 && height > 0) {
      let colorDataUrl = src;
      if (src.startsWith("blob:")) {
        try {
          // Convert blob URLs once so drag-time SVG rerenders don't keep re-requesting blob resources.
          colorDataUrl = await MediaUtils.ensureEmbeddedImageDataUrl(src);
        } catch {
          colorDataUrl = src;
        }
        if (renderToken !== viewerImageRenderToken) {
          return;
        }
      }
      cropResultCache = {
        colorDataUrl,
        width,
        height,
      };
      void prepareSobelCache(colorDataUrl).catch((error) => {
        const details = error instanceof Error ? error.message : String(error);
        if (__MCV_BACKEND__ === "web") {
          setMediaError(
            `Sobel precompute failed in web mode. Rebuild/update opencv.js whitelist (missing Sobel exports likely). ${details}`
          );
        } else {
          setMediaError(`Sobel precompute failed on backend: ${details}`);
        }
      });
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

function formatVertexSolveCoordValue(value: number | undefined): string {
  return ManualEditorController.formatVertexSolveCoordValue(value);
}

function formatVertexSolveCoordTuple(coord: VertexSolveCoord): string {
  return ManualEditorController.formatVertexSolveCoordTuple(coord);
}

function getManualInteractionMode(): ManualInteractionMode {
  return manualInteractionMode;
}

function setManualInteractionMode(mode: ManualInteractionMode): void {
  if (manualInteractionMode === mode) {
    return;
  }
  const isSolveMode = (value: ManualInteractionMode) =>
    value === "vertexSolve" || value === "poseSolve" || value === "reproject";
  const isPoseFamilyMode = (value: ManualInteractionMode) =>
    value === "poseSolve" || value === "reproject";
  const leavingSolveMode =
    isSolveMode(manualInteractionMode);
  const enteringSolveMode = isSolveMode(mode);
  if (leavingSolveMode && !enteringSolveMode) {
    purgeGeneratedVerticesKeepingAnchors();
  }
  if (isPoseFamilyMode(manualInteractionMode) && !isPoseFamilyMode(mode)) {
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
  } else if (mode === "reproject") {
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
  return ManualEditorController.buildPoseSolveArgsFromCurrentStructure(cropResultCache, MCV_DATA.structure);
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
  return ManualEditorController.buildAnchorInputFromAnchor(anchor);
}

function buildAnchorLabelFromInput(input: string): string {
  return ManualEditorController.buildAnchorLabelFromInput(input);
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

function findAnchorByLinks(from: number[], to: number[]): number {
  const sortedFrom = Array.from(new Set(from)).sort((a, b) => a - b);
  const sortedTo = Array.from(new Set(to)).sort((a, b) => a - b);
  for (let index = 0; index < MCV_DATA.structure.anchors.length; index += 1) {
    const anchor = MCV_DATA.structure.anchors[index];
    if (
      Geometry.areSortedArraysEqual(sortedFrom, anchor.from) &&
      Geometry.areSortedArraysEqual(sortedTo, anchor.to)
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
    !Geometry.areSortedArraysEqual(manualAnchorHoveredVertex.endpointIds, next.endpointIds);
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
        from: Geometry.normalizeLineRefs(vertex.from),
        to: Geometry.normalizeLineRefs(vertex.to),
        anchor: anchorIndex,
      });
    } else {
      retainedVertices.push({
        from: Geometry.normalizeLineRefs(anchor.from),
        to: Geometry.normalizeLineRefs(anchor.to),
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
    if (Geometry.areSortedArraysEqual(endpointIds, topologyVertices[index].endpointIds)) {
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
      from: Geometry.normalizeLineRefs(topo ? topo.endpointIds.filter((id) => id % 2 === 0).map((id) => Math.floor(id / 2)) : anchor.from),
      to: Geometry.normalizeLineRefs(topo ? topo.endpointIds.filter((id) => id % 2 === 1).map((id) => Math.floor(id / 2)) : anchor.to),
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
      from: Geometry.normalizeLineRefs(topo.endpointIds.filter((id) => id % 2 === 0).map((id) => Math.floor(id / 2))),
      to: Geometry.normalizeLineRefs(topo.endpointIds.filter((id) => id % 2 === 1).map((id) => Math.floor(id / 2))),
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

function findClosestDisplayedLineIndex(point: ManualPoint): number {
  const lines = getCurrentLinesForDisplay();
  if (lines.length === 0) {
    return -1;
  }
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  lines.forEach((line, index) => {
    const distance = Geometry.getDistancePointToSegment(point, SvgUtils.getLineSegmentForLine(line));
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
    vertex.from = Geometry.normalizeLineRefs(vertex.from);
    vertex.to = Geometry.normalizeLineRefs(vertex.to);
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
  remapOpopIndexesAfterLineRemoval(lineIndex);
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
  const threshold = Geometry.computeStructureLinkThreshold([...MCV_DATA.annotations, draftAnnotation]);
  for (let index = 0; index < MCV_DATA.annotations.length; index += 1) {
    if (annotationsWouldLink(draftAnnotation, MCV_DATA.annotations[index], threshold)) {
      potential.add(index);
    }
  }
  return potential;
}

function getOpopWhiskerCountForLine(segment: McvLineSegment, settings: OpopSettings = opopSettings): number {
  const dx = segment[2] - segment[0];
  const dy = segment[3] - segment[1];
  const lineLength = Math.hypot(dx, dy);
  if (lineLength <= 0) {
    return 0;
  }
  if (settings.whiskerMode === "per_pixel") {
    return Math.max(1, Math.round(lineLength / settings.whiskersPerPixel));
  }
  return Math.max(1, Math.round(settings.whiskersPerLine));
}

function getOpopWhiskerTs(whiskerCount: number, includeEndpoints: boolean): number[] {
  if (whiskerCount <= 0) {
    return [];
  }
  if (whiskerCount === 1) {
    return [includeEndpoints ? 0 : 0.5];
  }
  if (includeEndpoints) {
    return Array.from({ length: whiskerCount }, (_, i) => i / (whiskerCount - 1));
  }
  return Array.from({ length: whiskerCount }, (_, i) => (i + 1) / (whiskerCount + 1));
}

function buildOpopWhiskerSegmentsForSegment(
  segment: McvLineSegment,
  settings: OpopSettings = opopSettings
): McvLineSegment[] {
  const dx = segment[2] - segment[0];
  const dy = segment[3] - segment[1];
  const lineLength = Math.hypot(dx, dy);
  if (lineLength <= 0) {
    return [];
  }
  const whiskerCount = getOpopWhiskerCountForLine(segment, settings);
  if (whiskerCount <= 0) {
    return [];
  }
  const radius = Math.max(0, settings.normalSearchRadiusPx);
  if (radius <= 0) {
    return [];
  }
  const tangentX = dx / lineLength;
  const tangentY = dy / lineLength;
  const normalX = -tangentY;
  const normalY = tangentX;
  const ts = getOpopWhiskerTs(whiskerCount, settings.includeEndpoints);
  return ts.map((t) => {
    const cx = segment[0] + dx * t;
    const cy = segment[1] + dy * t;
    return [
      cx - normalX * radius,
      cy - normalY * radius,
      cx + normalX * radius,
      cy + normalY * radius,
    ];
  });
}

function projectPointToSegmentLine(point: ManualPoint, segment: McvLineSegment): ManualPoint {
  const ax = segment[0];
  const ay = segment[1];
  const bx = segment[2];
  const by = segment[3];
  const dx = bx - ax;
  const dy = by - ay;
  const denom = dx * dx + dy * dy;
  if (denom <= 1e-12) {
    return { x: ax, y: ay };
  }
  const t = clampNumber(((point.x - ax) * dx + (point.y - ay) * dy) / denom, 0, 1);
  return {
    x: ax + dx * t,
    y: ay + dy * t,
  };
}

function appendOpopWhiskersForSegment(
  parent: SVGElement,
  segment: McvLineSegment,
  stroke: string,
  strokeWidth: number,
  settings: OpopSettings = opopSettings,
  opacityScale = 1
): void {
  if (!settings.enabled) {
    return;
  }
  const whiskers = buildOpopWhiskerSegmentsForSegment(segment, settings);
  if (whiskers.length === 0) {
    return;
  }
  const opacity = clampNumber((settings.whiskerOpacityPercent / 100) * opacityScale, 0, 1);
  whiskers.forEach((whisker) => {
    SvgUtils.appendSvgLine(parent, whisker, stroke, strokeWidth, opacity);
  });
}

function captureLineSnapshot(line: ManualAnnotation): ManualAnnotation {
  return {
    from: { x: line.from.x, y: line.from.y },
    to: { x: line.to.x, y: line.to.y },
    axis: line.axis,
    ...(line.length !== undefined ? { length: line.length } : {}),
  };
}

function areLineEndpointsEquivalent(first: ManualAnnotation, second: ManualAnnotation, epsilon = 1e-4): boolean {
  return (
    first.axis === second.axis &&
    Math.abs(first.from.x - second.from.x) <= epsilon &&
    Math.abs(first.from.y - second.from.y) <= epsilon &&
    Math.abs(first.to.x - second.to.x) <= epsilon &&
    Math.abs(first.to.y - second.to.y) <= epsilon
  );
}

function lerpNumber(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function easeOutCubic(t: number): number {
  const clamped = clampNumber(t, 0, 1);
  return 1 - (1 - clamped) ** 3;
}

function tickOpopAnimations(now: number): void {
  opopAnimationRafId = null;
  if (opopLineAnimations.size === 0) {
    clearOpopAnimationOverlay();
    renderCropResultFromCache();
    return;
  }

  let committedLine = false;
  opopLineAnimations.forEach((animation, lineIndex) => {
    const line = MCV_DATA.annotations[lineIndex];
    if (!line) {
      opopLineAnimations.delete(lineIndex);
      return;
    }
    const slideElapsed = now - animation.startedAt;
    if (slideElapsed >= animation.slideDurationMs && animation.fadeStartedAt === null) {
      line.from = { x: animation.targetFrom.x, y: animation.targetFrom.y };
      line.to = { x: animation.targetTo.x, y: animation.targetTo.y };
      const structureLine = MCV_DATA.structure.lines[lineIndex];
      if (structureLine) {
        structureLine.from.x = animation.targetFrom.x;
        structureLine.from.y = animation.targetFrom.y;
        structureLine.to.x = animation.targetTo.x;
        structureLine.to.y = animation.targetTo.y;
      }
      animation.fadeStartedAt = now;
      animation.overlayOpacity = 1;
      committedLine = true;
    } else if (animation.fadeStartedAt !== null) {
      const fadeElapsed = now - animation.fadeStartedAt;
      animation.overlayOpacity = clampNumber(1 - fadeElapsed / animation.fadeDurationMs, 0, 1);
      if (animation.overlayOpacity <= 0) {
        opopLineAnimations.delete(lineIndex);
      }
    }
  });

  if (committedLine) {
    markAnnotationsDirty();
    // Rebuild once at slide-complete so base SVG line is present during fade phase.
    renderCropResultFromCache();
  }

  renderOpopAnimationOverlay(now);
  if (opopLineAnimations.size > 0) {
    opopAnimationRafId = requestAnimationFrame(tickOpopAnimations);
  } else if (committedLine) {
    clearOpopAnimationOverlay();
  } else {
    clearOpopAnimationOverlay();
  }
}

function startOpopAnimationLoop(): void {
  if (opopAnimationRafId !== null || opopLineAnimations.size === 0) {
    return;
  }
  opopAnimationRafId = requestAnimationFrame(tickOpopAnimations);
}

function startOpopLineAnimation(
  lineIndex: number,
  sourceLine: ManualAnnotation,
  targetFrom: ManualPoint,
  targetTo: ManualPoint,
  optimizedPoints: ManualPoint[],
  settingsSnapshot: OpopSettings
): void {
  const sourceSegment = SvgUtils.getLineSegmentForLine(sourceLine);
  const whiskers = buildOpopWhiskerSegmentsForSegment(sourceSegment, settingsSnapshot);
  const projectedPoints = optimizedPoints.map((point, index) => {
    const whisker = whiskers[index];
    return whisker ? projectPointToSegmentLine(point, whisker) : { x: point.x, y: point.y };
  });

  opopLineAnimations.set(lineIndex, {
    axis: sourceLine.axis,
    startFrom: { x: sourceLine.from.x, y: sourceLine.from.y },
    startTo: { x: sourceLine.to.x, y: sourceLine.to.y },
    targetFrom: { x: targetFrom.x, y: targetFrom.y },
    targetTo: { x: targetTo.x, y: targetTo.y },
    whiskers,
    points: projectedPoints,
    startedAt: performance.now(),
    fadeStartedAt: null,
    overlayOpacity: 1,
    whiskerOpacity: clampNumber(settingsSnapshot.whiskerOpacityPercent / 100, 0, 1),
    slideDurationMs: 480,
    fadeDurationMs: 520,
  });
  renderCropResultFromCache();
  startOpopAnimationLoop();
}

function getOrCreateOpopOverlayGroup(svg: SVGSVGElement): SVGGElement | null {
  const sceneGroup = svg.querySelector('[data-role="viewer-scene"]') as SVGGElement | null;
  if (!sceneGroup) {
    return null;
  }
  let overlay = sceneGroup.querySelector('[data-role="opop-animation-overlay"]') as SVGGElement | null;
  if (overlay) {
    return overlay;
  }
  const svgNs = "http://www.w3.org/2000/svg";
  overlay = document.createElementNS(svgNs, "g");
  overlay.setAttribute("data-role", "opop-animation-overlay");
  sceneGroup.appendChild(overlay);
  return overlay;
}

function clearOpopAnimationOverlay(): void {
  const svg = getViewerCropResultSvgNode();
  if (!svg) {
    return;
  }
  const overlay = svg.querySelector('[data-role="opop-animation-overlay"]') as SVGGElement | null;
  if (!overlay) {
    return;
  }
  overlay.replaceChildren();
}

function renderOpopAnimationOverlay(now: number): void {
  const svg = getViewerCropResultSvgNode();
  if (!svg) {
    return;
  }
  const overlay = getOrCreateOpopOverlayGroup(svg);
  if (!overlay) {
    return;
  }
  overlay.replaceChildren();
  const opopDotRadius = Math.max(0.25, 0.55 / Math.max(0.01, viewerMotion.zoom));

  opopLineAnimations.forEach((animation) => {
    const slideElapsed = now - animation.startedAt;
    const slideT = easeOutCubic(slideElapsed / animation.slideDurationMs);
    const fromPoint = {
      x: lerpNumber(animation.startFrom.x, animation.targetFrom.x, slideT),
      y: lerpNumber(animation.startFrom.y, animation.targetFrom.y, slideT),
    };
    const toPoint = {
      x: lerpNumber(animation.startTo.x, animation.targetTo.x, slideT),
      y: lerpNumber(animation.startTo.y, animation.targetTo.y, slideT),
    };
    const axisColor = SvgUtils.getAxisColor(animation.axis);
    SvgUtils.appendSvgLine(
      overlay,
      [fromPoint.x, fromPoint.y, toPoint.x, toPoint.y],
      axisColor,
      2,
      1,
      SvgUtils.getAxisMarkerId(animation.axis)
    );
    animation.whiskers.forEach((segment) => {
      SvgUtils.appendSvgLine(
        overlay,
        segment,
        axisColor,
        2,
        clampNumber(animation.whiskerOpacity * animation.overlayOpacity, 0, 1)
      );
    });
    animation.points.forEach((point) => {
      SvgUtils.appendSvgPointDot(overlay, point, "#ffffff", opopDotRadius, animation.overlayOpacity);
    });
  });
}

async function runOpopRefineForLine(
  lineIndex: number,
  sourceLine: ManualAnnotation,
  sourceImageDataUrl: string,
  settingsSnapshot: OpopSettings,
  dragLine?: { from: ManualPoint; to: ManualPoint }
): Promise<void> {
  if (!settingsSnapshot.enabled) {
    opopLineAnimations.delete(lineIndex);
    renderOpopAnimationOverlay(performance.now());
    return;
  }
  const nextToken = (opopRefineTokenByLine.get(lineIndex) ?? 0) + 1;
  opopRefineTokenByLine.set(lineIndex, nextToken);
  try {
    const result = await runOpopRefineLine(sourceImageDataUrl, sourceLine, settingsSnapshot, dragLine);
    if (opopRefineTokenByLine.get(lineIndex) !== nextToken) {
      return;
    }
    const current = MCV_DATA.annotations[lineIndex];
    if (!current || !areLineEndpointsEquivalent(current, sourceLine)) {
      return;
    }
    const safePoints = Array.isArray(result.points)
      ? result.points
          .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
          .map((point) => ({ x: point.x, y: point.y }))
      : [];
    startOpopLineAnimation(
      lineIndex,
      sourceLine,
      { x: result.from.x, y: result.from.y },
      { x: result.to.x, y: result.to.y },
      safePoints,
      settingsSnapshot
    );
    renderCropResultFromCache();
  } catch {
    if (opopRefineTokenByLine.get(lineIndex) !== nextToken) {
      return;
    }
    opopLineAnimations.delete(lineIndex);
    renderCropResultFromCache();
  }
}

function createManualModeCropResultSvg(
  width: number,
  height: number,
  colorDataUrl: string
): SVGSVGElement {
  const svg = SvgUtils.createCropResultSvgBase(
    width,
    height,
    colorDataUrl,
    opopSettings.imageSmoothingEnabled
  );
  SvgUtils.appendAxisMarkers(svg);
  const sceneGroup = svg.querySelector('[data-role="viewer-scene"]') as SVGGElement | null;
  if (!sceneGroup) {
    return svg;
  }

  const anchorMode = getManualInteractionMode() === "anchor";
  const editMode = getManualInteractionMode() === "edit";
  const vertexSolveMode = getManualInteractionMode() === "vertexSolve";
  const reprojectMode = getManualInteractionMode() === "reproject";
  const poseResult = poseSolveState?.status === "done" ? poseSolveState.result : undefined;
  const solveData = vertexSolveMode
    ? (vertexSolveRenderData ?? (vertexSolveRenderData = runVertexSolveAndBuildData()))
    : null;
  const potentialLinkIndexes = manualDraftLine ? getDraftPotentialLinkIndexes(manualDraftLine) : new Set<number>();
  const linesToRender: Array<ManualAnnotation | StructureLine> = getCurrentLinesForDisplay();
  const reprojectedLines = reprojectMode
    ? (poseResult?.reprojected_lines ?? [])
    : [];

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

  if (reprojectMode) {
    reprojectedLines.forEach((line) => {
      const sourceLine = MCV_DATA.structure.lines[line.line_index];
      if (!sourceLine) {
        return;
      }
      const axisColor = SvgUtils.getAxisColor(sourceLine.axis);
      const segment: McvLineSegment = [line.from.x, line.from.y, line.to.x, line.to.y];
      SvgUtils.appendSvgLine(sceneGroup, segment, axisColor, 2.2, 1);
    });
  } else {
    linesToRender.forEach((line, index) => {
      const opopAnimation = opopLineAnimations.get(index) ?? null;
      const hideBaseLineForOpop = Boolean(opopAnimation && opopAnimation.fadeStartedAt === null);
      const editHighlighted =
        editMode && (manualEditHoveredLineIndex === index || manualEditSelectedLineIndex === index);
      const axisColor =
        vertexSolveMode
          ? solveData && solveData.traversedLineIndexes.has(index)
            ? "#5dff74"
            : "#ffffff"
          : (anchorMode && anchorLightIndexes.has(index)) || editHighlighted
          ? SvgUtils.getAxisLightColor(line.axis)
          : potentialLinkIndexes.has(index)
            ? SvgUtils.getAxisLightColor(line.axis)
            : SvgUtils.getAxisColor(line.axis);
      const segment = SvgUtils.getLineSegmentForLine(line);
      if (!hideBaseLineForOpop) {
        SvgUtils.appendSvgLine(
          sceneGroup,
          segment,
          axisColor,
          2,
          1,
          anchorMode || vertexSolveMode ? undefined : SvgUtils.getAxisMarkerId(line.axis)
        );
      }
      if (!hideBaseLineForOpop && !anchorMode && !vertexSolveMode) {
        SvgUtils.appendSvgLineLabel(sceneGroup, segment, line.length, axisColor);
      }
    });
  }
  if (!anchorMode && !vertexSolveMode && !reprojectMode && manualDraftLine) {
    const draftSegment = SvgUtils.getLineSegmentForDraft(manualDraftLine);
    const axisColor = SvgUtils.getAxisColor(manualDraftLine.axis);
    SvgUtils.appendSvgLine(
      sceneGroup,
      draftSegment,
      axisColor,
      2,
      0.95,
      SvgUtils.getAxisMarkerId(manualDraftLine.axis)
    );
    appendOpopWhiskersForSegment(sceneGroup, draftSegment, axisColor, 2);
    SvgUtils.appendSvgLineLabel(sceneGroup, draftSegment, manualDraftLine.length, axisColor);
  }

  if (anchorMode) {
    MCV_DATA.structure.anchors.forEach((anchor, index) => {
      const point = getAnchorPoint(anchor);
      if (!point) {
        return;
      }
      const selected = manualAnchorSelectedIndex === index;
      SvgUtils.appendSvgPointDot(sceneGroup, point, selected ? "#5ca8ff" : "#ffffff", 2.2);
      SvgUtils.appendSvgAnchorLabel(
        sceneGroup,
        point,
        getAnchorLabel(anchor, index),
        selected ? "#5ca8ff" : "#ffffff"
      );
    });
    if (manualAnchorHoveredVertex) {
      SvgUtils.appendSvgPointDot(sceneGroup, manualAnchorHoveredVertex.point, "#ffe46b", 2.8);
    }
  }
  if (vertexSolveMode && solveData) {
    MCV_DATA.structure.anchors.forEach((anchor) => {
      const point = getAnchorPoint(anchor);
      if (point) {
        SvgUtils.appendSvgPointDot(sceneGroup, point, "#5dff74", 2.6);
      }
    });
    solveData.generatedVertexIndexes.forEach((vertexIndex) => {
      const vertex = solveData.topologyVertices[vertexIndex];
      if (vertex) {
        SvgUtils.appendSvgPointDot(sceneGroup, vertex.point, "#5dff74", 2.4);
      }
    });
    if (solveData.conflictVertexIndex !== null) {
      const conflict = solveData.topologyVertices[solveData.conflictVertexIndex];
      if (conflict) {
        SvgUtils.appendSvgPointDot(sceneGroup, conflict.point, "#ff4d4d", 3.2);
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
      SvgUtils.appendSvgAnchorLabel(sceneGroup, hoveredPoint, labelText, "#ffe46b");
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
    if (vertexSolveMode || reprojectMode) {
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
    if (!cropResultCache || event.ctrlKey || viewerCtrlHeld || anchorMode || vertexSolveMode || reprojectMode) {
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
    refreshOpopStageVisibility();
    return;
  }
  if (getManualInteractionMode() === "poseSolve") {
    hideViewerCropResult();
    if (imageStage) {
      imageStage.classList.add("hidden");
    }
    renderPoseSolvePanel();
    refreshOpopStageVisibility();
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
  refreshOpopStageVisibility();
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
  if (getManualInteractionMode() === "reproject") {
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
    const newLineIndex = MCV_DATA.annotations.length - 1;
    const newLine = MCV_DATA.annotations[newLineIndex];
    if (newLine && cropResultCache) {
      const sourceImageDataUrl = cropResultCache.colorDataUrl;
      const sourceLine = captureLineSnapshot(newLine);
      const settingsSnapshot = getOpopSettings();
      const dragLine = {
        from: { x: committedFrom.x, y: committedFrom.y },
        to: { x: committedTo.x, y: committedTo.y },
      };
      void runOpopRefineForLine(newLineIndex, sourceLine, sourceImageDataUrl, settingsSnapshot, dragLine);
    }
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

function findVideoByYoutubeId(youtubeId: string): { id: string; item: MediaVideoEntry } | null {
  return MediaController.findVideoByYoutubeId(mediaLibrary, youtubeId);
}

function findMediaById(id: string): ViewerMedia | null {
  return MediaController.findMediaById(mediaLibrary, id);
}

function splitSecondsAndFrames(secondsValue: number): { seconds: number; frames: number } {
  return MediaController.splitSecondsAndFrames(secondsValue, getViewerFrameBase());
}

function buildMcvSourceFromViewer(viewer: ViewerMedia): McvDataSource | null {
  return MediaController.buildMcvSourceFromViewer(mediaLibrary, viewer, getViewerFrameBase());
}

function resolveVideoViewerFromSource(source: McvDataSource): ViewerMedia | null {
  return MediaController.resolveVideoViewerFromSource(
    mediaLibrary,
    activeMediaTab,
    source,
    MediaUtils.normalizePossibleUrl
  );
}

function parseLaunchSelectionIntent(): LaunchSelectionIntent | null {
  return MediaController.parseLaunchSelectionIntent();
}

function buildLaunchSeekInfo(intent: LaunchSelectionIntent): {
  initialSeekSeconds?: number;
  timestampLabel?: string;
} {
  return MediaController.buildLaunchSeekInfo(
    intent,
    getViewerFrameBase(),
    MediaUtils.parseTimestampSeconds,
    MediaUtils.formatTimestamp
  );
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
  return MediaController.findMediaByNormalizedUrl(
    mediaLibrary,
    activeMediaTab,
    normalizedUrl,
    MediaUtils.normalizePossibleUrl
  );
}

function setTabButtonState(): void {
  MediaController.setTabButtonState(activeMediaTab);
}

function matchesMediaSearch(id: string, item: MediaVideoEntry | MediaImageEntry, tab: MediaTab): boolean {
  return MediaController.matchesMediaSearch(mediaSearchQuery, id, item, tab, {
    normalizeSearchToken: MediaUtils.normalizeSearchToken,
    parseSearchIntent: MediaUtils.parseSearchIntent,
    normalizePossibleUrl: MediaUtils.normalizePossibleUrl,
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
    from: Geometry.normalizeLineRefs(anchor.from),
    to: Geometry.normalizeLineRefs(anchor.to),
    vertex: anchor.vertex,
    ...(anchor.x !== undefined ? { x: anchor.x } : {}),
    ...(anchor.y !== undefined ? { y: anchor.y } : {}),
    ...(anchor.z !== undefined ? { z: anchor.z } : {}),
  }));
  MCV_DATA.structure.vertices = data.vertices.map((vertex) => ({
    from: Geometry.normalizeLineRefs(vertex.from),
    to: Geometry.normalizeLineRefs(vertex.to),
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
  clearOpopOptimizedPoints();
  clearAnnotationsDirty();
}

async function tryLoadMcvSvgFile(file: File): Promise<{ imageDataUrl: string; data: unknown } | null> {
  const text = await MediaUtils.readFileAsText(file);
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
  const imageDataUrl = await MediaUtils.ensureEmbeddedImageDataUrl(cropResultCache.colorDataUrl);
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("xmlns", svgNs);
  svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  svg.setAttribute("xmlns:inkscape", "http://www.inkscape.org/namespaces/inkscape");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  SvgUtils.appendAxisMarkers(svg);

  const baseLayer = SvgUtils.createSvgLayer(svg, "base", true);
  const baseImage = document.createElementNS(svgNs, "image");
  baseImage.setAttribute("data-role", "mcv-base-image");
  baseImage.setAttribute("href", imageDataUrl);
  baseImage.setAttribute("x", "0");
  baseImage.setAttribute("y", "0");
  baseImage.setAttribute("width", String(width));
  baseImage.setAttribute("height", String(height));
  baseImage.setAttribute("preserveAspectRatio", "none");
  baseLayer.appendChild(baseImage);

  const annotationLayer = SvgUtils.createSvgLayer(svg, "annotation", false);
  SvgUtils.renderLinesToLayer(annotationLayer, MCV_DATA.annotations, true, true);

  const structureLayer = SvgUtils.createSvgLayer(svg, "structure", true);
  SvgUtils.renderLinesToLayer(structureLayer, MCV_DATA.structure.lines, true, true);

  const anchorsLayer = SvgUtils.createSvgLayer(svg, "anchors", false);
  MCV_DATA.structure.anchors.forEach((anchor, index) => {
    const point = getAnchorPoint(anchor);
    if (!point) {
      return;
    }
    SvgUtils.appendSvgPointDot(anchorsLayer, point, "#5dff74", 2.4);
    SvgUtils.appendSvgAnchorLabel(anchorsLayer, point, getAnchorLabel(anchor, index), "#5dff74");
  });

  const includeVerticesLayer =
    getManualInteractionMode() === "vertexSolve" &&
    vertexSolveRenderData !== null &&
    vertexSolveRenderData.conflictVertexIndex === null;
  if (includeVerticesLayer) {
    const verticesLayer = SvgUtils.createSvgLayer(svg, "vertices", false);
    MCV_DATA.structure.vertices.forEach((vertex) => {
      const point = getVertexDotPoint(vertex);
      if (!point) {
        return;
      }
      SvgUtils.appendSvgPointDot(verticesLayer, point, "#5dff74", 2.2);
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
  if (MediaUtils.isSvgFile(file)) {
    try {
      const parsed = await tryLoadMcvSvgFile(file);
      if (parsed) {
        const normalized = MediaUtils.normalizeImportedMcvData(parsed.data);
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
    kind: MediaUtils.inferMediaKindFromFile(file),
    title: file.name,
    url: objectUrl,
    isObjectUrl: true,
  });
}

function clampVideoTime(video: HTMLVideoElement, seconds: number): number {
  return ViewerController.clampVideoTime(video, seconds);
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
  const frameBase = getViewerFrameBase();
  const frame = Math.min(frameBase - 1, Math.floor(fractional * frameBase));
  viewerHmsInput.value = `${MediaUtils.formatTimestamp(wholeSeconds)}|${frame}`;
}

function parseFrameSuffix(raw: string): { base: string; frame: number } | null {
  return ViewerController.parseFrameSuffix(raw);
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
  const baseSeconds = MediaUtils.parseTimestampSeconds(parsedWithFrame.base);
  if (baseSeconds === null) {
    return;
  }
  const frameBase = getViewerFrameBase();
  const normalizedFrame = Math.min(parsedWithFrame.frame, frameBase - 1);
  const targetSeconds = Math.max(0, baseSeconds) + normalizedFrame / frameBase;
  viewerVideoNode.currentTime = clampVideoTime(viewerVideoNode, targetSeconds);
}

function getCurrentViewerTimeParts(): { seconds: number; frame: number } {
  return ViewerController.getCurrentViewerTimeParts(
    viewerVideoNode,
    viewerActiveVideoContext,
    getViewerFrameBase()
  );
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
    MediaUtils.normalizePossibleUrl(MCV_DATA.source.url) === MediaUtils.normalizePossibleUrl(viewerActiveVideoContext.url);
  if (!sameVideo) {
    return;
  }
  MCV_DATA.source.seconds = seconds;
  MCV_DATA.source.frames = frame;
}

function getShareBaseUrl(): URL {
  return ViewerController.getShareBaseUrl();
}

function buildViewerShareUrl(): string | null {
  return ViewerController.buildViewerShareUrl(viewerActiveVideoContext, getCurrentViewerTimeParts());
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
  return ViewerController.buildViewerYoutubeUrl(viewerActiveVideoContext, getCurrentViewerTimeParts());
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
  viewerDetectedFps = null;
  startViewerFrameRateProbe(videoNode);

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

  videoNode.addEventListener("ratechange", () => {
    syncViewerTimeInputs(true);
  });

  videoNode.addEventListener("emptied", () => {
    viewerDetectedFps = null;
    syncViewerTimeInputs(true);
  });

  videoNode.addEventListener("loadeddata", () => {
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
    linkedVideo.initialSeekSeconds =
      Math.max(0, source.seconds ?? 0) + Math.max(0, source.frames ?? 0) / getViewerFrameBase();
    linkedVideo.timestampLabel = `${MediaUtils.formatTimestamp(Math.max(0, source.seconds ?? 0))}|${Math.max(0, source.frames ?? 0)}`;
  }
  renderVideoViewerUi(viewerContent, linkedVideo, {
    containerRole: "linked-video-source",
    sourceLabel: `Source video: ${linkedVideo.title}`,
  });
}

function getAnalyzedFrameTitle(): string {
  const { seconds, frame } = getCurrentViewerTimeParts();
  const sourceTitle = viewerActiveVideoContext?.title ? ` from ${viewerActiveVideoContext.title}` : "";
  return `Frame${sourceTitle} @ ${MediaUtils.formatTimestamp(seconds)}|${frame}`;
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
  stopViewerFrameRateProbe();
  clearViewerFullImage();
  void clearSobelCache("viewer_exit").catch(() => {
    // Ignore background cache-clear failures when leaving viewer.
  });
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
    const hasQuery = MediaUtils.normalizeSearchToken(mediaSearchQuery).length > 0;
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
      if (activeMediaTab === "videos") {
        const videoItem = item as MediaVideoEntry;
        openViewer({
          tab: "videos",
          id,
          kind: "video",
          title: videoItem.name,
          url: videoItem.url,
          ...(videoItem.youtube_id ? { youtubeId: videoItem.youtube_id } : {}),
        });
        return;
      }

      const imageItem = item as MediaImageEntry;
      openViewer({
        tab: "images",
        id,
        kind: "image",
        title: imageItem.name,
        url: imageItem.url,
      });
    });

    const metaNode = document.createElement("div");
    metaNode.className = "media-meta";
    metaNode.textContent = id;
    if (activeMediaTab === "videos") {
      const videoItem = item as MediaVideoEntry;
      if (videoItem.youtube_id) {
        const separatorNode = document.createTextNode(" | YouTube: ");
        const youtubeLinkNode = document.createElement("a");
        const youtubeUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoItem.youtube_id)}`;
        configureExternalLink(youtubeLinkNode, youtubeUrl, videoItem.youtube_id);
        metaNode.appendChild(separatorNode);
        metaNode.appendChild(youtubeLinkNode);
      }
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
      if (getManualInteractionMode() === "reproject") {
        event.preventDefault();
        setManualInteractionMode("poseSolve");
        void runPoseSolveFromCurrentStructure();
        return;
      }
    }
    if (event.key === "r" || event.key === "R") {
      if (getManualInteractionMode() === "poseSolve" && poseSolveState?.status === "done") {
        event.preventDefault();
        setManualInteractionMode("reproject");
        return;
      }
      if (getManualInteractionMode() === "reproject") {
        event.preventDefault();
        setManualInteractionMode("poseSolve");
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
      } else if (getManualInteractionMode() === "reproject") {
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
        getManualInteractionMode() === "poseSolve" ||
        getManualInteractionMode() === "reproject"
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
        getManualInteractionMode() === "poseSolve" ||
        getManualInteractionMode() === "reproject"
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
        getManualInteractionMode() === "poseSolve" ||
        getManualInteractionMode() === "reproject"
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
        getManualInteractionMode() === "poseSolve" ||
        getManualInteractionMode() === "reproject"
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
      if (getManualInteractionMode() === "reproject") {
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
    deltaSeconds = -getViewerFrameDurationSeconds();
  } else if (event.key === ".") {
    deltaSeconds = getViewerFrameDurationSeconds();
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

  const url = MediaUtils.parseUrlOrNull(trimmed);
  if (!url) {
    return;
  }

  clearMediaError();

  if (MediaUtils.isYoutubeUrl(url)) {
    const youtubeId = MediaUtils.extractYoutubeId(url);
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
    const timestampLabel = MediaUtils.extractYoutubeTimestampLabel(url);
    const initialSeekSeconds = (() => {
      const raw = (url.searchParams.get("t") || "").trim();
      const parsed = MediaUtils.parseTimestampSeconds(raw);
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

  const normalizedUrl = MediaUtils.normalizeUrlForMatch(url);
  const matchedMedia = findMediaByNormalizedUrl(normalizedUrl);
  if (matchedMedia) {
    activeMediaTab = matchedMedia.tab;
    openViewer(matchedMedia);
    setTabButtonState();
    return;
  }

  const inferredKind = MediaUtils.inferMediaKindFromUrl(url);
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
  window.addEventListener("pagehide", () => {
    void clearSobelCache("unload").catch(() => {
      // Ignore shutdown-time cache clear failures.
    });
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
    const parsed = MediaUtils.parseMediaLibrary(await response.json());
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
  installOpopUiHandlers();
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
