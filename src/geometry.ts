import * as T from "three";

export type PartMode = "object" | "vertex" | "face" | "edge";
export function faceVertices(g: T.BufferGeometry, face: number): number[] {
  return [0, 1, 2].map((k) =>
    g.index ? g.index.getX(face * 3 + k) : face * 3 + k,
  );
}
export function deleteFaces(g: T.BufferGeometry, faces: Set<number>) {
  const count = (g.index?.count ?? g.getAttribute("position").count) / 3;
  const indices: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  for (let f = 0; f < count; f++) {
    if (faces.has(f)) continue;
    const mi =
      g.groups.find((x) => f * 3 >= x.start && f * 3 < x.start + x.count)
        ?.materialIndex ?? 0;
    const last = groups.at(-1);
    if (last?.materialIndex === mi) last.count += 3;
    else groups.push({ start: indices.length, count: 3, materialIndex: mi });
    indices.push(...faceVertices(g, f));
  }
  g.setIndex(indices);
  g.clearGroups();
  groups.forEach((x) => g.addGroup(x.start, x.count, x.materialIndex));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
}
export function connectedVertices(g: T.BufferGeometry, seeds: Set<number>) {
  const p = g.getAttribute("position");
  const neighbors = Array.from({ length: p.count }, () => new Set<number>());
  const same = new Map<string, number[]>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(6)},${p.getY(i).toFixed(6)},${p.getZ(i).toFixed(6)}`;
    const list = same.get(key) ?? [];
    list.push(i);
    same.set(key, list);
  }
  for (let f = 0; f < (g.index?.count ?? p.count) / 3; f++) {
    const vs = faceVertices(g, f);
    vs.forEach((a) => vs.forEach((b) => neighbors[a].add(b)));
  }
  same.forEach((vs) =>
    vs.forEach((a) => vs.forEach((b) => neighbors[a].add(b))),
  );
  const result = new Set(seeds),
    queue = [...seeds];
  for (let k = 0; k < queue.length; k++)
    neighbors[queue[k]]?.forEach((b) => {
      if (!result.has(b)) {
        result.add(b);
        queue.push(b);
      }
    });
  return result;
}
export function proportionalMove(
  g: T.BufferGeometry,
  selected: Set<number>,
  delta: T.Vector3,
  radius: number,
  strength: number,
  smooth: number,
  connected: boolean,
  mirror: boolean,
) {
  const p = g.getAttribute("position") as T.BufferAttribute,
    seeds = [...selected].map((i) => new T.Vector3().fromBufferAttribute(p, i));
  if (mirror) seeds.push(...seeds.map((v) => new T.Vector3(-v.x, v.y, v.z)));
  const allowed = connected ? connectedVertices(g, selected) : null;
  for (let i = 0; i < p.count; i++) {
    if (allowed && !allowed.has(i)) continue;
    const v = new T.Vector3().fromBufferAttribute(p, i);
    let d = Infinity;
    for (const seed of seeds) d = Math.min(d, v.distanceTo(seed));
    const t = Math.max(0, 1 - d / Math.max(radius, 0.0001));
    const weight = Math.pow(t * t * (3 - 2 * t), smooth) * strength;
    v.addScaledVector(delta, weight);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
}
export function transformUV(
  g: T.BufferGeometry,
  vertices: Set<number>,
  channel: string,
  move: T.Vector2,
  rotation: number,
  scale: T.Vector2,
) {
  const uv = g.getAttribute(channel) as T.BufferAttribute | undefined;
  if (!uv || !vertices.size) return;
  const center = new T.Vector2();
  vertices.forEach((i) => center.add(new T.Vector2(uv.getX(i), uv.getY(i))));
  center.divideScalar(vertices.size);
  vertices.forEach((i) => {
    const v = new T.Vector2(uv.getX(i), uv.getY(i))
      .sub(center)
      .multiply(scale)
      .rotateAround(new T.Vector2(), rotation)
      .add(center)
      .add(move);
    uv.setXY(i, v.x, v.y);
  });
  uv.needsUpdate = true;
}
