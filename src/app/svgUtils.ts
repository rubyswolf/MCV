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

type DraftManualLine = {
  from: ManualPoint;
  to: ManualPoint;
  axis: ManualAxis;
  flipped: boolean;
  length?: number;
};

type McvLineSegment = [number, number, number, number];

export function createCropResultSvgBase(
  width: number,
  height: number,
  imageDataUrl: string,
  smoothImage = false
): SVGSVGElement {
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
  imageNode.setAttribute("image-rendering", smoothImage ? "auto" : "pixelated");
  const sceneGroup = document.createElementNS(svgNs, "g");
  sceneGroup.setAttribute("data-role", "viewer-scene");
  sceneGroup.appendChild(imageNode);
  svg.appendChild(sceneGroup);
  return svg;
}

export function appendSvgLine(
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

export function appendSvgLineLabel(
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

export function appendSvgPointDot(
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

export function appendSvgAnchorLabel(
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

export function getLineSegmentForLine(line: { from: ManualPoint; to: ManualPoint }): McvLineSegment {
  return [line.from.x, line.from.y, line.to.x, line.to.y];
}

export function getLineSegmentForDraft(draft: DraftManualLine): McvLineSegment {
  const from = draft.flipped ? draft.to : draft.from;
  const to = draft.flipped ? draft.from : draft.to;
  return [from.x, from.y, to.x, to.y];
}

export function getAxisColor(axis: ManualAxis): string {
  if (axis === "x") {
    return "#ff4d4d";
  }
  if (axis === "y") {
    return "#5dff74";
  }
  return "#4da1ff";
}

export function getAxisLightColor(axis: ManualAxis): string {
  if (axis === "x") {
    return "#ff9a9a";
  }
  if (axis === "y") {
    return "#a6ffb3";
  }
  return "#9ec7ff";
}

export function getAxisMarkerId(axis: ManualAxis): string {
  return `mcv-arrow-${axis}`;
}

export function appendAxisMarkers(svg: SVGSVGElement): void {
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

export function createSvgLayer(
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

export function renderLinesToLayer(
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
