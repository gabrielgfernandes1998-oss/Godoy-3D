import { describe, expect, it } from "vitest";
import * as T from "three";
import { fitCamera, visibleBounds } from "./framing";

describe("enquadramento de vários modelos", () => {
  for (const aspect of [0.3, 1, 3])
    for (const size of [0.0001, 100, 100000]) {
      it(`mantém todos os cantos na tela: proporção ${aspect}, escala ${size}`, () => {
        const camera = new T.PerspectiveCamera(42, aspect, 0.01, 10000);
        const box = new T.Box3(
          new T.Vector3(-size, -size / 2, -size),
          new T.Vector3(3 * size, 2 * size, size),
        );
        fitCamera(camera, box, new T.Vector3(1, 0.65, 1.4));
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
              const projected = new T.Vector3(x, y, z).project(camera);
              expect(Math.abs(projected.x)).toBeLessThan(1);
              expect(Math.abs(projected.y)).toBeLessThan(1);
              expect(projected.z).toBeGreaterThan(-1);
              expect(projected.z).toBeLessThan(1);
            }
      });
    }
  it("enquadra modelos distantes na câmera ortográfica", () => {
    const camera = new T.OrthographicCamera(-2, 2, 5, -5, 0.01, 10000);
    const box = new T.Box3(
      new T.Vector3(-10, -5, -3),
      new T.Vector3(100000, 8, 12),
    );
    fitCamera(camera, box, new T.Vector3(0, 0, 1));
    for (const v of [box.min, box.max]) {
      const p = v.clone().project(camera);
      expect(Math.abs(p.x)).toBeLessThan(1);
      expect(Math.abs(p.y)).toBeLessThan(1);
      expect(Math.abs(p.z)).toBeLessThan(1);
    }
  });
  it("ignora objetos ocultos e malhas sem faces sem modificar os objetos", () => {
    const root = new T.Group();
    const visible = new T.Mesh(new T.BoxGeometry(2, 2, 2));
    const hidden = new T.Group();
    hidden.visible = false;
    const distant = new T.Mesh(new T.BoxGeometry(2, 2, 2));
    distant.position.x = 100000;
    hidden.add(distant);
    const empty = new T.Mesh(new T.BoxGeometry(2, 2, 2));
    empty.geometry.setIndex([]);
    empty.position.y = 100000;
    root.add(visible, hidden, empty);
    root.updateMatrixWorld(true);
    const before = JSON.stringify(root.toJSON());
    const box = visibleBounds([root]);
    expect(box.min.toArray()).toEqual([-1, -1, -1]);
    expect(box.max.toArray()).toEqual([1, 1, 1]);
    expect(JSON.stringify(root.toJSON())).toBe(before);
  });
});
