import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";
import { USDZLoader } from "three/addons/loaders/USDZLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import JSZip from "jszip";
import {
  connectedVertices,
  deleteFaces,
  faceVertices,
  proportionalMove,
  transformUV,
  type PartMode,
} from "./geometry";

export function download(
  data: BlobPart,
  name: string,
  type = "application/octet-stream",
) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
export class Editor {
  scene = new T.Scene();
  root = new T.Group();
  camera: T.PerspectiveCamera | T.OrthographicCamera;
  renderer: T.WebGLRenderer;
  orbit: OrbitControls;
  gizmo: TransformControls;
  selected: T.Object3D[] = [];
  parts = new Set<number>();
  mode: PartMode = "object";
  activeMesh: T.Mesh | null = null;
  ray = new T.Raycaster();
  mouse = new T.Vector2();
  grid: T.GridHelper;
  axes: T.AxesHelper;
  overlay = new T.Group();
  pivot = new T.Object3D();
  history: string[] = [];
  future: string[] = [];
  tool = "translate";
  shape = "click";
  selectionOp = "replace";
  through = false;
  radius = 0.65;
  strength = 1;
  smooth = 1;
  connected = true;
  mirror = false;
  axis = "y";
  uvChannel = "uv";
  snapTarget: string | null = null;
  changed: () => void;
  notify: (s: string) => void;
  private frame = 0;
  private resize: ResizeObserver;
  private dragStart = new T.Vector3();
  private oldPivot = new T.Matrix4();
  private baseGeom: T.BufferGeometry | null = null;
  private gesture: T.Vector2[] = [];
  private down = new T.Vector2();
  private disposed = false;
  private selectSvg: SVGSVGElement;
  constructor(
    public host: HTMLElement,
    changed: () => void,
    notify: (s: string) => void,
  ) {
    this.changed = changed;
    this.notify = notify;
    this.scene.background = new T.Color("#191c23");
    this.scene.add(this.root, this.overlay, this.pivot);
    this.camera = new T.PerspectiveCamera(42, 1, 0.01, 10000);
    this.camera.position.set(4.5, 3.5, 6.5);
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    host.appendChild(this.renderer.domElement);
    this.scene.add(new T.HemisphereLight(0xe2edff, 0x383444, 2.7));
    const light = new T.DirectionalLight(0xfff2dc, 3.2);
    light.position.set(3, 7, 5);
    this.scene.add(light);
    const fill = new T.DirectionalLight(0x7c9cff, 1.6);
    fill.position.set(-5, 2, -3);
    this.scene.add(fill);
    this.grid = new T.GridHelper(20, 40, 0x46505e, 0x2b303b);
    this.axes = new T.AxesHelper(1.3);
    this.scene.add(this.grid, this.axes);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.target.set(0, 0.65, 0);
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener("dragging-changed", (e) => {
      this.orbit.enabled = !e.value;
    });
    this.gizmo.addEventListener("mouseDown", () => {
      this.checkpoint();
      this.oldPivot.copy(this.pivot.matrixWorld);
      this.dragStart.copy(this.pivot.position);
      this.baseGeom = this.activeMesh?.geometry.clone() ?? null;
    });
    this.gizmo.addEventListener("objectChange", () => this.applyGizmo());
    this.gizmo.addEventListener("mouseUp", () => {
      this.baseGeom?.dispose();
      this.baseGeom = null;
      this.refreshOverlay();
      this.changed();
    });
    this.selectSvg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    this.selectSvg.classList.add("selection-svg");
    host.appendChild(this.selectSvg);
    this.renderer.domElement.addEventListener("pointerdown", this.onDown);
    this.renderer.domElement.addEventListener("pointermove", this.onMove);
    this.renderer.domElement.addEventListener("pointerup", this.onUp);
    this.resize = new ResizeObserver(() => this.size());
    this.resize.observe(host);
    this.size();
    this.animate();
    this.examples(false);
  }
  size() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (this.camera instanceof T.PerspectiveCamera) this.camera.aspect = w / h;
    else {
      this.camera.left = ((-h / 100) * w) / h;
      this.camera.right = ((h / 100) * w) / h;
      this.camera.top = h / 100;
      this.camera.bottom = -h / 100;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
  animate = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.orbit.dispose();
    this.gizmo.dispose();
    this.renderer.dispose();
    this.host.replaceChildren();
  }
  meshes(objects = this.selected) {
    const result: T.Mesh[] = [];
    objects.forEach((o) =>
      o.traverse((n) => {
        if (n instanceof T.Mesh) result.push(n);
      }),
    );
    return result;
  }
  snapshot() {
    return JSON.stringify(this.root.toJSON());
  }
  checkpoint() {
    this.history.push(this.snapshot());
    if (this.history.length > 30) this.history.shift();
    this.future = [];
  }
  restore(value: string) {
    const obj = new T.ObjectLoader().parse(JSON.parse(value));
    this.scene.remove(this.root);
    this.root = obj as T.Group;
    this.scene.add(this.root);
    this.select([]);
    this.changed();
  }
  undo() {
    const v = this.history.pop();
    if (v) {
      this.future.push(this.snapshot());
      this.restore(v);
      this.notify("Edição desfeita.");
    }
  }
  redo() {
    const v = this.future.pop();
    if (v) {
      this.history.push(this.snapshot());
      this.restore(v);
      this.notify("Edição refeita.");
    }
  }
  examples(record = true) {
    if (record) this.checkpoint();
    this.root.clear();
    const g = new T.BufferGeometry().copy(new T.SphereGeometry(1.5, 48, 24));
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      p.setXYZ(
        i,
        x + Math.max(0, y) * 0.25,
        0.65 + y * 0.32 - Math.max(0, -x) * 0.16,
        z * 0.84,
      );
    }
    g.computeVertexNormals();
    const beret = new T.Mesh(
      g,
      new T.MeshStandardMaterial({
        color: 0x586c49,
        roughness: 0.92,
        metalness: 0.05,
      }),
    );
    beret.name = "Boina";
    const badge = new T.Mesh(
      new T.BufferGeometry().copy(new T.CylinderGeometry(0.24, 0.24, 0.055, 6)),
      new T.MeshStandardMaterial({
        color: 0xd5b47a,
        metalness: 0.7,
        roughness: 0.3,
      }),
    );
    badge.rotation.x = Math.PI / 2;
    badge.position.set(0.25, 0.66, 1.23);
    badge.name = "Insígnia";
    this.root.add(beret, badge);
    this.select([beret]);
    this.frameSelection();
    this.changed();
  }
  select(objects: T.Object3D[]) {
    this.selected = objects;
    this.parts.clear();
    this.activeMesh = this.meshes().length === 1 ? this.meshes()[0] : null;
    this.updateGizmo();
    this.refreshOverlay();
    this.changed();
  }
  setMode(mode: PartMode) {
    this.mode = mode;
    this.parts.clear();
    if (
      mode !== "object" &&
      (!this.activeMesh ||
        this.activeMesh instanceof T.SkinnedMesh ||
        Object.values(this.activeMesh.geometry.morphAttributes).some(
          (a) => a && a.length > 0,
        ))
    ) {
      this.notify(
        "Selecione um objeto com uma única malha estática. Malhas com esqueleto ou morph targets têm edição de partes bloqueada para preservar seus dados.",
      );
      this.mode = "object";
    }
    this.updateGizmo();
    this.refreshOverlay();
    this.changed();
  }
  setTool(tool: string) {
    this.tool = tool;
    this.gizmo.setMode(
      tool === "pull"
        ? "translate"
        : (tool as "translate" | "rotate" | "scale"),
    );
    this.updateGizmo();
    this.refreshOverlay();
    this.changed();
  }
  updateGizmo() {
    this.gizmo.detach();
    if (!this.selected.length || this.selected.some((o) => o.userData.locked))
      return;
    if (this.mode === "object" && this.selected.length === 1) {
      this.gizmo.attach(this.selected[0]);
      return;
    }
    if (this.parts.size && this.activeMesh) {
      const p = this.activeMesh.geometry.getAttribute("position");
      const c = new T.Vector3();
      this.partVertices().forEach((i) =>
        c.add(new T.Vector3().fromBufferAttribute(p, i)),
      );
      c.divideScalar(this.partVertices().size);
      this.pivot.position.copy(this.activeMesh.localToWorld(c));
      this.pivot.rotation.set(0, 0, 0);
      this.pivot.scale.set(1, 1, 1);
      this.pivot.updateMatrixWorld();
      this.gizmo.attach(this.pivot);
    }
  }
  partVertices() {
    const set = new Set<number>();
    if (!this.activeMesh) return set;
    if (this.mode === "vertex") return new Set(this.parts);
    this.parts.forEach((f) =>
      faceVertices(this.activeMesh!.geometry, f).forEach((i) => set.add(i)),
    );
    return set;
  }
  applyGizmo() {
    if (this.gizmo.object !== this.pivot) {
      this.refreshOverlay();
      this.changed();
      return;
    }
    const mesh = this.activeMesh;
    if (!mesh || !this.baseGeom) return;
    mesh.geometry.copy(this.baseGeom);
    const ids = this.partVertices();
    if (this.tool === "pull") {
      const d = this.pivot.position.clone().sub(this.dragStart);
      const inv = new T.Matrix4().copy(mesh.matrixWorld).invert();
      const local = d
        .clone()
        .applyMatrix4(inv)
        .sub(new T.Vector3().applyMatrix4(inv));
      proportionalMove(
        mesh.geometry,
        ids,
        local,
        this.radius,
        this.strength,
        this.smooth,
        this.connected,
        this.mirror,
      );
    } else {
      this.pivot.updateMatrixWorld();
      const m = mesh.matrixWorld
        .clone()
        .invert()
        .multiply(this.pivot.matrixWorld)
        .multiply(this.oldPivot.clone().invert())
        .multiply(mesh.matrixWorld);
      const p = mesh.geometry.getAttribute("position") as T.BufferAttribute;
      ids.forEach((i) => {
        const v = new T.Vector3().fromBufferAttribute(p, i).applyMatrix4(m);
        p.setXYZ(i, v.x, v.y, v.z);
      });
      p.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
    }
    this.refreshOverlay();
  }
  refreshOverlay() {
    for (const c of [...this.overlay.children]) {
      this.overlay.remove(c);
      if (
        c instanceof T.LineSegments ||
        c instanceof T.Points ||
        c instanceof T.Mesh
      ) {
        c.geometry.dispose();
        (c.material as T.Material).dispose();
      }
    }
    this.selected.forEach((o) => {
      const box = new T.BoxHelper(o, 0xe8b869);
      this.overlay.add(box);
    });
    const mesh = this.activeMesh;
    if (!mesh || this.mode === "object") return;
    mesh.updateWorldMatrix(true, false);
    const g = mesh.geometry,
      p = g.getAttribute("position");
    const points: number[] = [],
      colors: number[] = [];
    const ids = this.partVertices();
    if (this.tool === "pull" && ids.size) {
      const center = new T.Vector3();
      ids.forEach((i) => center.add(new T.Vector3().fromBufferAttribute(p, i)));
      center.divideScalar(ids.size);
      const influence = new T.Mesh(
        new T.SphereGeometry(this.radius, 32, 16),
        new T.MeshBasicMaterial({
          color: 0xe9b76b,
          wireframe: true,
          transparent: true,
          opacity: 0.1,
          depthTest: false,
        }),
      );
      influence.position.copy(center);
      influence.updateMatrix();
      influence.matrix.premultiply(mesh.matrixWorld);
      influence.matrix.decompose(
        influence.position,
        influence.quaternion,
        influence.scale,
      );
      this.overlay.add(influence);
    }
    if (this.mode === "vertex") {
      for (let i = 0; i < p.count; i++) {
        const v = new T.Vector3()
          .fromBufferAttribute(p, i)
          .applyMatrix4(mesh.matrixWorld);
        points.push(v.x, v.y, v.z);
        const c = new T.Color(ids.has(i) ? 0xffc772 : 0x8695a9);
        colors.push(c.r, c.g, c.b);
      }
      const pg = new T.BufferGeometry();
      pg.setAttribute("position", new T.Float32BufferAttribute(points, 3));
      pg.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
      this.overlay.add(
        new T.Points(
          pg,
          new T.PointsMaterial({
            size: 6,
            sizeAttenuation: false,
            vertexColors: true,
            depthTest: !this.through,
          }),
        ),
      );
    } else {
      const pos: number[] = [];
      this.parts.forEach((f) =>
        faceVertices(g, f).forEach((i) => {
          const v = new T.Vector3()
            .fromBufferAttribute(p, i)
            .applyMatrix4(mesh.matrixWorld);
          pos.push(v.x, v.y, v.z);
        }),
      );
      const fg = new T.BufferGeometry();
      fg.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      this.overlay.add(
        new T.Mesh(
          fg,
          new T.MeshBasicMaterial({
            color: 0xffb957,
            transparent: true,
            opacity: 0.55,
            side: T.DoubleSide,
            depthTest: false,
          }),
        ),
      );
    }
  }
  point(event: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new T.Vector2(event.clientX - r.left, event.clientY - r.top);
  }
  onDown = (e: PointerEvent) => {
    this.down = this.point(e);
    this.gesture = [this.down.clone()];
    if (e.button === 0 && this.shape !== "click" && !this.gizmo.axis) {
      this.orbit.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
    }
  };
  onMove = (e: PointerEvent) => {
    if (!e.buttons || this.shape === "click" || this.orbit.enabled) return;
    const p = this.point(e);
    this.gesture.push(p);
    const a = this.down;
    const points =
      this.shape === "box"
        ? [a, new T.Vector2(p.x, a.y), p, new T.Vector2(a.x, p.y)]
        : this.gesture;
    this.selectSvg.innerHTML = `<polygon points="${points.map((v) => `${v.x},${v.y}`).join(" ")}"/>`;
  };
  onUp = (e: PointerEvent) => {
    const end = this.point(e),
      moved = end.distanceTo(this.down) > 5;
    this.selectSvg.innerHTML = "";
    if (this.gizmo.dragging || this.gizmo.axis) {
      this.orbit.enabled = true;
      return;
    }
    if (e.button !== 0) return;
    if (this.shape !== "click" && moved) {
      this.areaSelect(end);
      this.orbit.enabled = true;
      return;
    }
    this.orbit.enabled = true;
    if (moved) return;
    this.mouse.set(
      (end.x / this.host.clientWidth) * 2 - 1,
      (-end.y / this.host.clientHeight) * 2 + 1,
    );
    this.ray.setFromCamera(this.mouse, this.camera);
    const hits = this.ray
      .intersectObjects(this.root.children, true)
      .filter((h) => h.object.visible && !this.isLocked(h.object));
    const hit = hits[0];
    if (this.snapTarget && hit) {
      this.snap(hit);
      return;
    }
    if (this.mode === "object") {
      if (!hit) {
        if (!e.shiftKey) this.select([]);
        return;
      }
      let obj = hit.object;
      while (obj.parent && obj.parent !== this.root) obj = obj.parent;
      const add = e.shiftKey || this.selectionOp === "add";
      if (this.selectionOp === "remove")
        this.select(this.selected.filter((x) => x !== obj));
      else this.select(add ? [...new Set([...this.selected, obj])] : [obj]);
    } else if (hit && hit.object === this.activeMesh && hit.faceIndex != null) {
      let id = hit.faceIndex;
      if (this.mode === "vertex") {
        const p = this.activeMesh!.geometry.getAttribute("position");
        id = faceVertices(this.activeMesh!.geometry, id).sort(
          (a, b) =>
            new T.Vector3()
              .fromBufferAttribute(p, a)
              .applyMatrix4(this.activeMesh!.matrixWorld)
              .distanceTo(hit.point) -
            new T.Vector3()
              .fromBufferAttribute(p, b)
              .applyMatrix4(this.activeMesh!.matrixWorld)
              .distanceTo(hit.point),
        )[0];
      }
      if (this.selectionOp === "replace" && !e.shiftKey) this.parts.clear();
      if (this.selectionOp === "remove" || (e.shiftKey && this.parts.has(id)))
        this.parts.delete(id);
      else this.parts.add(id);
      this.updateGizmo();
      this.refreshOverlay();
      this.changed();
    }
  };
  isLocked(o: T.Object3D) {
    let n: T.Object3D | null = o;
    while (n && n !== this.root) {
      if (n.userData.locked || !n.visible) return true;
      n = n.parent;
    }
    return false;
  }
  areaSelect(end: T.Vector2) {
    const polygon =
      this.shape === "box"
        ? [
            this.down,
            new T.Vector2(end.x, this.down.y),
            end,
            new T.Vector2(this.down.x, end.y),
          ]
        : this.gesture;
    const inside = (p: T.Vector2) => {
      let c = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i],
          b = polygon[j];
        if (
          a.y > p.y !== b.y > p.y &&
          p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
        )
          c = !c;
      }
      return c;
    };
    if (this.mode === "object") {
      const found = this.root.children.filter((o) =>
        inside(
          this.screen(new T.Box3().setFromObject(o).getCenter(new T.Vector3())),
        ),
      );
      this.select(
        this.selectionOp === "add"
          ? [...new Set([...this.selected, ...found])]
          : this.selectionOp === "remove"
            ? this.selected.filter((o) => !found.includes(o))
            : found,
      );
      return;
    }
    if (!this.activeMesh) return;
    const mesh = this.activeMesh,
      p = mesh.geometry.getAttribute("position");
    if (this.selectionOp === "replace") this.parts.clear();
    const count =
      this.mode === "vertex"
        ? p.count
        : (mesh.geometry.index?.count ?? p.count) / 3;
    for (let i = 0; i < count; i++) {
      const v = new T.Vector3();
      if (this.mode === "vertex") v.fromBufferAttribute(p, i);
      else
        faceVertices(mesh.geometry, i).forEach((id) =>
          v.add(new T.Vector3().fromBufferAttribute(p, id)),
        );
      if (this.mode !== "vertex") v.divideScalar(3);
      v.applyMatrix4(mesh.matrixWorld);
      const screen = this.screen(v);
      if (!inside(screen)) continue;
      if (!this.through) {
        this.mouse.set(
          (screen.x / this.host.clientWidth) * 2 - 1,
          (-screen.y / this.host.clientHeight) * 2 + 1,
        );
        this.ray.setFromCamera(this.mouse, this.camera);
        const hit = this.ray.intersectObject(mesh)[0];
        if (hit && hit.point.distanceTo(v) > 0.035) continue;
      }
      if (this.selectionOp === "remove") this.parts.delete(i);
      else this.parts.add(i);
    }
    this.updateGizmo();
    this.refreshOverlay();
    this.changed();
  }
  screen(v: T.Vector3) {
    v = v.clone().project(this.camera);
    return new T.Vector2(
      ((v.x + 1) / 2) * this.host.clientWidth,
      ((1 - v.y) / 2) * this.host.clientHeight,
    );
  }
  selectConnected() {
    if (!this.activeMesh || !this.parts.size) return;
    const ids = connectedVertices(
      this.activeMesh.geometry,
      this.partVertices(),
    );
    if (this.mode === "vertex") this.parts = ids;
    else {
      this.parts.clear();
      for (
        let f = 0;
        f <
        (this.activeMesh.geometry.index?.count ??
          this.activeMesh.geometry.getAttribute("position").count) /
          3;
        f++
      )
        if (faceVertices(this.activeMesh.geometry, f).some((i) => ids.has(i)))
          this.parts.add(f);
    }
    this.updateGizmo();
    this.refreshOverlay();
    this.changed();
  }
  invert() {
    if (!this.activeMesh) return;
    const g = this.activeMesh.geometry,
      count =
        this.mode === "vertex"
          ? g.getAttribute("position").count
          : (g.index?.count ?? g.getAttribute("position").count) / 3;
    this.parts = new Set(
      Array.from({ length: count }, (_, i) => i).filter(
        (i) => !this.parts.has(i),
      ),
    );
    this.updateGizmo();
    this.refreshOverlay();
    this.changed();
  }
  remove() {
    if (!this.selected.length) return;
    if (this.selected.some((o) => o.userData.locked))
      return this.notify("Desbloqueie o objeto antes de editar.");
    if (this.mode === "object") {
      this.checkpoint();
      this.selected.forEach((o) => o.removeFromParent());
      this.select([]);
      return;
    }
    if (!this.activeMesh || !this.parts.size) return;
    const g = this.activeMesh.geometry;
    let faces = new Set(this.parts);
    if (this.mode === "vertex") {
      faces = new Set();
      for (
        let f = 0;
        f < (g.index?.count ?? g.getAttribute("position").count) / 3;
        f++
      )
        if (faceVertices(g, f).some((i) => this.parts.has(i))) faces.add(f);
      if (
        !confirm(
          `Apagar os vértices também removerá ${faces.size} faces adjacentes e deixará uma abertura. Continuar?`,
        )
      )
        return;
    }
    this.checkpoint();
    deleteFaces(g, faces);
    this.parts.clear();
    this.updateGizmo();
    this.refreshOverlay();
    this.changed();
    this.notify("Faces apagadas. O UV das faces restantes foi preservado.");
  }
  group() {
    if (this.selected.some((o) => o.userData.locked))
      return this.notify("Desbloqueie os objetos antes de agrupar.");
    if (this.selected.length < 2)
      return this.notify("Selecione pelo menos dois objetos na lista.");
    this.checkpoint();
    const group = new T.Group();
    group.name = "Grupo";
    this.root.add(group);
    this.selected.forEach((o) => group.attach(o));
    this.select([group]);
    this.notify("Objetos agrupados; as malhas continuam separadas.");
  }
  join() {
    if (this.selected.some((o) => o.userData.locked))
      return this.notify("Desbloqueie os objetos antes de unir.");
    const meshes = this.meshes();
    if (meshes.length < 2)
      return this.notify("Selecione pelo menos duas malhas para unir.");
    if (
      meshes.some(
        (m) =>
          m instanceof T.SkinnedMesh ||
          Object.values(m.geometry.morphAttributes).some(
            (a) => a && a.length > 0,
          ),
      )
    )
      return this.notify(
        "União de malhas com esqueleto ou morph targets indisponível; os dados foram preservados.",
      );
    const channels = new Set(
      meshes.flatMap((m) => Object.keys(m.geometry.attributes)),
    );
    if (
      [...channels].some(
        (c) =>
          !["position", "normal", "uv", "uv1", "uv2", "uv3", "color"].includes(
            c,
          ),
      )
    )
      return this.notify(
        "A união foi cancelada: há atributos adicionais incompatíveis.",
      );
    const gs: T.BufferGeometry[] = [],
      materials: T.Material[] = [];
    let offset = 0;
    const groups: { start: number; count: number; materialIndex: number }[] =
      [];
    let start = 0;
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      let g = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      if (!g.getAttribute("normal")) g.computeVertexNormals();
      for (const channel of channels) {
        if (!g.getAttribute(channel)) {
          const size = channel === "color" ? 3 : 2;
          const arr = new Float32Array(g.getAttribute("position").count * size);
          if (channel === "color") arr.fill(1);
          g.setAttribute(channel, new T.BufferAttribute(arr, size));
        }
      }
      const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const local = g.groups.length
        ? g.groups
        : [
            {
              start: 0,
              count: g.getAttribute("position").count,
              materialIndex: 0,
            },
          ];
      local.forEach((gr) =>
        groups.push({
          start: start + gr.start,
          count: gr.count,
          materialIndex:
            offset +
            (Array.isArray(mesh.material) ? (gr.materialIndex ?? 0) : 0),
        }),
      );
      start += g.getAttribute("position").count;
      offset += ms.length;
      materials.push(...ms);
      g.clearGroups();
      gs.push(g);
    }
    const merged = mergeGeometries(gs, false);
    if (!merged)
      return this.notify(
        "As malhas têm atributos incompatíveis; união cancelada.",
      );
    groups.forEach((g) => merged.addGroup(g.start, g.count, g.materialIndex));
    this.checkpoint();
    const result = new T.Mesh(merged, materials);
    result.name = "Boina + insígnia";
    this.selected.forEach((o) => o.removeFromParent());
    this.root.add(result);
    this.select([result]);
    gs.forEach((g) => g.dispose());
    this.notify(
      "Malhas reunidas em um objeto. Materiais e UVs preservados; a geometria não foi fundida.",
    );
  }
  duplicate() {
    if (!this.selected.length) return;
    this.checkpoint();
    const copies = this.selected.map((o) => {
      const c = o.clone(true);
      c.traverse((n) => {
        if (n instanceof T.Mesh) {
          n.geometry = n.geometry.clone();
          n.material = Array.isArray(n.material)
            ? n.material.map((m) => m.clone())
            : n.material.clone();
        }
      });
      c.position.x += 0.3;
      c.name = o.name + " (cópia)";
      this.root.add(c);
      return c;
    });
    this.select(copies);
  }
  frameSelection() {
    const box = new T.Box3();
    (this.selected.length ? this.selected : [this.root]).forEach((o) =>
      box.union(new T.Box3().setFromObject(o)),
    );
    if (box.isEmpty()) return;
    const center = box.getCenter(new T.Vector3()),
      size = box.getSize(new T.Vector3()).length();
    this.orbit.target.copy(center);
    this.camera.position
      .copy(center)
      .add(
        new T.Vector3(1, 0.65, 1.4)
          .normalize()
          .multiplyScalar(Math.max(size * 1.55, 1)),
      );
    if (this.camera instanceof T.OrthographicCamera) {
      this.camera.zoom = 10 / Math.max(size, 1);
      this.camera.updateProjectionMatrix();
    }
    this.orbit.update();
  }
  view(name: string) {
    const directions: Record<string, number[]> = {
      front: [0, 0, 1],
      back: [0, 0, -1],
      left: [-1, 0, 0],
      right: [1, 0, 0],
      top: [0, 1, 0.0001],
      bottom: [0, -1, 0.0001],
    };
    const d = directions[name];
    if (!d) return;
    const distance = this.camera.position.distanceTo(this.orbit.target);
    this.camera.position
      .copy(this.orbit.target)
      .add(new T.Vector3(...d).multiplyScalar(distance));
    this.orbit.update();
  }
  projection() {
    const prev = this.camera;
    this.camera =
      prev instanceof T.PerspectiveCamera
        ? new T.OrthographicCamera(-5, 5, 5, -5, 0.01, 10000)
        : new T.PerspectiveCamera(42, 1, 0.01, 10000);
    this.camera.position.copy(prev.position);
    this.camera.quaternion.copy(prev.quaternion);
    this.orbit.object = this.camera;
    this.gizmo.camera = this.camera;
    this.size();
    this.changed();
  }
  wire(value: boolean) {
    this.meshes([this.root]).forEach((m) =>
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => {
        if ("wireframe" in mat)
          (mat as T.MeshStandardMaterial).wireframe = value;
      }),
    );
  }
  pullExact(amount: number) {
    if (!this.activeMesh || !this.parts.size)
      return this.notify("Selecione vértices ou faces antes de puxar.");
    this.checkpoint();
    const delta = new T.Vector3();
    delta[this.axis as "x" | "y" | "z"] = amount;
    proportionalMove(
      this.activeMesh.geometry,
      this.partVertices(),
      delta,
      this.radius,
      this.strength,
      this.smooth,
      this.connected,
      this.mirror,
    );
    this.refreshOverlay();
    this.updateGizmo();
    this.changed();
  }
  uvEdit(move: T.Vector2, rotation: number, scale: T.Vector2) {
    if (!this.activeMesh || !this.partVertices().size)
      return this.notify("Selecione partes do modelo ou do mapa UV.");
    this.checkpoint();
    transformUV(
      this.activeMesh.geometry,
      this.partVertices(),
      this.uvChannel,
      move,
      rotation,
      scale,
    );
    this.changed();
  }
  async loadTexture(file: File) {
    if (!this.activeMesh) return this.notify("Selecione uma malha primeiro.");
    if (!/image\/(png|jpeg)/.test(file.type))
      return this.notify("Use uma imagem PNG ou JPG.");
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const texture = await new T.TextureLoader().loadAsync(url);
    texture.colorSpace = T.SRGBColorSpace;
    texture.flipY = false;
    this.checkpoint();
    const mesh = this.activeMesh;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m.clone())
      : mesh.material.clone();
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(
      (mat) => {
        if ("map" in mat) {
          (mat as T.MeshStandardMaterial).map = texture;
          mat.needsUpdate = true;
        }
      },
    );
    this.changed();
  }
  snap(hit: T.Intersection) {
    const piece = this.selected[0];
    if (!piece || piece === hit.object)
      return this.notify("Clique em outro objeto para escolher a superfície.");
    this.checkpoint();
    const normal =
      hit.face?.normal.clone().transformDirection(hit.object.matrixWorld) ??
      new T.Vector3(0, 1, 0);
    piece.position.copy(hit.point).addScaledVector(normal, 0.04);
    piece.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), normal);
    this.snapTarget = null;
    this.refreshOverlay();
    this.changed();
    this.notify(
      "Peça alinhada à superfície, com afastamento de 0,04 unidade. Ajuste fino no painel.",
    );
  }
  async importFiles(files: File[], scale = 1, up = "y") {
    const urls = new Map<string, string>();
    const manager = new T.LoadingManager();
    const names = new Map(files.map((f) => [f.name.toLowerCase(), f]));
    const urlFor = (f: File) => {
      let url = urls.get(f.name);
      if (!url) {
        url = URL.createObjectURL(f);
        urls.set(f.name, url);
      }
      return url;
    };
    manager.setURLModifier((url) => {
      const file = names.get(
        decodeURIComponent(url.split("/").pop() ?? "").toLowerCase(),
      );
      return file ? urlFor(file) : url;
    });
    manager.onError = (url) =>
      this.notify(`Recurso ausente ou incompatível: ${url.split("/").pop()}`);
    const objects: T.Object3D[] = [];
    try {
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (["mtl", "png", "jpg", "jpeg", "bin", "webp"].includes(ext ?? ""))
          continue;
        this.notify(`Importando ${file.name}…`);
        let obj: T.Object3D;
        if (ext === "glb" || ext === "gltf") {
          const gltf = await new GLTFLoader(manager).parseAsync(
            await file.arrayBuffer(),
            "",
          );
          obj = gltf.scene;
          if (gltf.animations.length) {
            obj.animations = gltf.animations;
            this.notify(
              "Animações preservadas. A reprodução de animações não está disponível nesta versão.",
            );
          }
        } else if (ext === "obj") {
          const loader = new OBJLoader(manager);
          const mtl = files.find((f) => f.name.toLowerCase().endsWith(".mtl"));
          if (mtl) {
            const materials = new MTLLoader(manager).parse(
              await mtl.text(),
              "",
            );
            materials.preload();
            loader.setMaterials(materials);
          } else if (/mtllib\s/.test(await file.text()))
            this.notify(
              "Este OBJ referencia um MTL. Importe novamente incluindo MTL e texturas.",
            );
          obj = loader.parse(await file.text());
        } else if (ext === "stl")
          obj = new T.Mesh(
            new STLLoader(manager).parse(await file.arrayBuffer()),
            new T.MeshStandardMaterial({ color: 0xa7b4c3 }),
          );
        else if (ext === "fbx")
          obj = new FBXLoader(manager).parse(await file.arrayBuffer(), "");
        else if (ext === "3mf")
          obj = new ThreeMFLoader(manager).parse(await file.arrayBuffer());
        else if (ext === "usdz")
          obj = new USDZLoader(manager).parse(await file.arrayBuffer());
        else if (ext === "godoy") {
          const json = JSON.parse(await file.text());
          if (json.format !== "godoy-3d" || !json.scene)
            throw new Error("Projeto Godoy inválido.");
          obj = await new T.ObjectLoader(manager).parseAsync(json.scene);
        } else if (ext === "blend")
          throw new Error(
            "BLEND requer um serviço separado com Blender, ainda não configurado. Exporte como GLB no Blender.",
          );
        else if (ext === "dxf")
          throw new Error(
            "DXF ainda indisponível: desenhos 2D precisam de extrusão; entidades 3D como 3DFACE e MESH precisam de um conversor dedicado.",
          );
        else throw new Error(`Formato .${ext} não suportado.`);
        if (!this.meshes([obj]).length)
          throw new Error("O arquivo não contém malhas compatíveis.");
        this.meshes([obj]).forEach((m) => {
          if (m.geometry.type !== "BufferGeometry")
            m.geometry = new T.BufferGeometry().copy(m.geometry);
        });
        obj.name = file.name.replace(/\.[^.]+$/, "");
        obj.scale.multiplyScalar(scale);
        if (up === "z") obj.rotateX(-Math.PI / 2);
        objects.push(obj);
      }
      if (objects.length) {
        this.checkpoint();
        this.root.add(...objects);
        this.select(objects);
        this.frameSelection();
        this.notify(
          `${objects.length} arquivo(s) importado(s). Escala aplicada: ${scale}; eixo vertical: ${up.toUpperCase()}.`,
        );
      }
    } catch (err) {
      this.notify(`Importação interrompida: ${(err as Error).message}`);
      if (objects.length) {
        this.checkpoint();
        this.root.add(...objects);
        this.select(objects);
        this.frameSelection();
      }
    } finally {
      setTimeout(() => urls.forEach((url) => URL.revokeObjectURL(url)), 10000);
      this.changed();
    }
  }
  saveProject() {
    download(
      JSON.stringify({
        format: "godoy-3d",
        version: 1,
        scene: this.root.toJSON(),
      }),
      "projeto.godoy",
      "application/json",
    );
    this.notify("Projeto salvo com geometria, materiais e UVs.");
  }
  async export(format: string, selectedOnly: boolean) {
    const objects = selectedOnly ? this.selected : this.root.children;
    if (!objects.length) return this.notify("Não há objetos para exportar.");
    const group = new T.Group();
    objects.forEach((o) => {
      o.updateWorldMatrix(true, true);
      const clone = cloneSkeleton(o);
      clone.matrix.copy(o.matrixWorld);
      clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
      group.add(clone);
    });
    try {
      if (format === "glb") {
        const out = await new GLTFExporter().parseAsync(group, {
          binary: true,
          onlyVisible: false,
          animations: objects.flatMap((o) => o.animations),
        });
        download(out as ArrayBuffer, "godoy-modelo.glb");
      } else if (format === "stl") {
        download(
          new STLExporter().parse(group, { binary: true }),
          "godoy-modelo.stl",
        );
        this.notify(
          "STL exportado: somente geometria, sem UVs, materiais ou texturas.",
        );
        return;
      } else {
        const zip = new JSZip();
        const materials: T.Material[] = [];
        group.traverse((o) => {
          if (o instanceof T.Mesh) {
            o.material = Array.isArray(o.material)
              ? o.material.map((m) => m.clone())
              : o.material.clone();
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(
              (m) => {
                m.name = `material_${materials.length}`;
                materials.push(m);
              },
            );
          }
        });
        let mtl = "";
        for (const mat of materials) {
          const m = mat as T.MeshStandardMaterial;
          const c = m.color ?? new T.Color("white");
          mtl += `newmtl ${m.name}\nKd ${c.r} ${c.g} ${c.b}\nd ${m.opacity}\n`;
          if (m.map?.image) {
            const canvas = document.createElement("canvas");
            const image = m.map.image;
            canvas.width = image.width;
            canvas.height = image.height;
            canvas.getContext("2d")!.drawImage(image, 0, 0);
            const data = canvas.toDataURL("image/png").split(",")[1];
            zip.file(`${m.name}.png`, data, { base64: true });
            mtl += `map_Kd ${m.name}.png\n`;
          }
          mtl += "\n";
        }
        zip.file(
          "modelo.obj",
          "mtllib materiais.mtl\n" + new OBJExporter().parse(group),
        );
        zip.file("materiais.mtl", mtl);
        download(await zip.generateAsync({ type: "blob" }), "godoy-obj.zip");
        this.notify(
          "OBJ, MTL e texturas exportados em ZIP. Extraia os arquivos juntos para reimportar.",
        );
        return;
      }
      this.notify("GLB exportado com materiais, texturas e UVs.");
    } catch (err) {
      this.notify(`Falha na exportação: ${(err as Error).message}`);
    }
  }
}
