export type ManualPoint = {
  x: number;
  y: number;
};

export type ManualAnnotation = {
  from: ManualPoint;
  to: ManualPoint;
};

export type McvLineSegment = [number, number, number, number];

export function getAnnotationLength(annotation: ManualAnnotation): number {
  return Math.hypot(annotation.to.x - annotation.from.x, annotation.to.y - annotation.from.y);
}

export function computeStructureLinkThreshold(annotations: ManualAnnotation[]): number {
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

export function normalizeLineRefs(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

export function remapLineRefsAfterLineRemoval(values: number[], removedLineIndex: number): number[] {
  return normalizeLineRefs(
    values
      .filter((value) => value !== removedLineIndex)
      .map((value) => (value > removedLineIndex ? value - 1 : value))
  );
}

export function getInfiniteLineIntersection(
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

export function getLeastSquaresLinePoint(lines: ManualAnnotation[]): ManualPoint | null {
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

export function getDistancePointToSegment(point: ManualPoint, segment: McvLineSegment): number {
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

export function areSortedArraysEqual(first: number[], second: number[]): boolean {
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

export function wrapDegrees180(angleDeg: number): number {
  return ((angleDeg + 180) % 360) - 180;
}
