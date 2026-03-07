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

type McvPoseSolveArgs = {
  width: number;
  height: number;
  lines: StructureLine[];
  vertices: StructureVertexData[];
  initial_vfov_deg?: number;
};

export function formatVertexSolveCoordValue(value: number | undefined): string {
  if (value === undefined) {
    return "?";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export function formatVertexSolveCoordTuple(coord: { x?: number; y?: number; z?: number }): string {
  return `(${formatVertexSolveCoordValue(coord.x)}, ${formatVertexSolveCoordValue(coord.y)}, ${formatVertexSolveCoordValue(coord.z)})`;
}

export function buildPoseSolveArgsFromCurrentStructure(
  cropResultCache: {
    colorDataUrl: string;
    width: number;
    height: number;
  } | null,
  structure: StructureData
): McvPoseSolveArgs | null {
  if (!cropResultCache) {
    return null;
  }
  return {
    width: cropResultCache.width,
    height: cropResultCache.height,
    lines: structure.lines.map((line) => ({
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
    vertices: structure.vertices.map((vertex) => ({
      from: [...vertex.from],
      to: [...vertex.to],
      ...(vertex.anchor !== undefined ? { anchor: vertex.anchor } : {}),
      ...(vertex.x !== undefined ? { x: vertex.x } : {}),
      ...(vertex.y !== undefined ? { y: vertex.y } : {}),
      ...(vertex.z !== undefined ? { z: vertex.z } : {}),
    })),
  };
}

export function buildAnchorInputFromAnchor(anchor: StructureAnchor): string {
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

export function buildAnchorLabelFromInput(input: string): string {
  return `(${input})`;
}
