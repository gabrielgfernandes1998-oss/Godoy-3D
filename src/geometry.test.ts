import { describe, it, expect } from "vitest";
import * as T from "three";
import {
  deleteFaces,
  faceVertices,
  proportionalMove,
  transformUV,
} from "./geometry";
describe("edição de malhas", () => {
  it("apaga faces sem perder UVs e respeita índices e materiais", () => {
    const g = new T.PlaneGeometry(2, 2);
    g.clearGroups();
    g.addGroup(0, 3, 0);
    g.addGroup(3, 3, 1);
    const uv = Array.from(g.getAttribute("uv").array);
    const second = faceVertices(g, 1);
    deleteFaces(g, new Set([0]));
    expect(g.index?.count).toBe(3);
    expect(faceVertices(g, 0)).toEqual(second);
    expect(Array.from(g.getAttribute("uv").array)).toEqual(uv);
    expect(g.groups).toEqual([{ start: 0, count: 3, materialIndex: 1 }]);
  });
  it("move a região com influência suave e mantém pontos distantes", () => {
    const g = new T.PlaneGeometry(4, 2, 4, 2);
    const p = g.getAttribute("position");
    const center = Array.from({ length: p.count }, (_, i) => i).find(
      (i) => p.getX(i) === 0 && p.getY(i) === 0,
    )!;
    const near = Array.from({ length: p.count }, (_, i) => i).find(
      (i) => p.getX(i) === 1 && p.getY(i) === 0,
    )!;
    const far = Array.from({ length: p.count }, (_, i) => i).find(
      (i) => p.getX(i) === 2 && p.getY(i) === 0,
    )!;
    proportionalMove(
      g,
      new Set([center]),
      new T.Vector3(0, 0, -1),
      1.8,
      1,
      1,
      false,
      false,
    );
    expect(p.getZ(center)).toBeCloseTo(-1);
    expect(p.getZ(near)).toBeLessThan(0);
    expect(p.getZ(near)).toBeGreaterThan(-1);
    expect(p.getZ(far)).toBe(0);
  });
  it("não deforma uma peça desconectada mesmo dentro do raio", () => {
    const g = new T.BufferGeometry();
    g.setAttribute(
      "position",
      new T.Float32BufferAttribute(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0.1, 1, 0, 0.1, 0, 1, 0.1],
        3,
      ),
    );
    proportionalMove(
      g,
      new Set([0]),
      new T.Vector3(0, -1, 0),
      2,
      1,
      1,
      true,
      false,
    );
    expect(g.getAttribute("position").getY(0)).toBe(-1);
    expect(g.getAttribute("position").getY(3)).toBe(0);
  });
  it("edita UVs sem mudar geometria ou outros canais", () => {
    const g = new T.PlaneGeometry();
    g.setAttribute("uv1", g.getAttribute("uv").clone());
    const positions = Array.from(g.getAttribute("position").array);
    const other = Array.from(g.getAttribute("uv1").array);
    const uv = g.getAttribute("uv");
    const old = uv.getX(0);
    transformUV(
      g,
      new Set([0, 1]),
      "uv",
      new T.Vector2(0.2, 0.1),
      0,
      new T.Vector2(1, 1),
    );
    expect(uv.getX(0)).toBeCloseTo(old + 0.2);
    expect(Array.from(g.getAttribute("position").array)).toEqual(positions);
    expect(Array.from(g.getAttribute("uv1").array)).toEqual(other);
  });
});
