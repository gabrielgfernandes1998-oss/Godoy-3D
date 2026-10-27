import * as T from "three";

/** Bounds of rendered meshes, ignoring hidden groups and meshes with no faces. */
export function visibleBounds(objects: T.Object3D[]): T.Box3 {
  const box = new T.Box3();
  for (const object of objects) {
    object.updateWorldMatrix(true, true);
    let ancestor: T.Object3D | null = object.parent;
    let hidden = false;
    while (ancestor) {
      hidden ||= !ancestor.visible;
      ancestor = ancestor.parent;
    }
    if (hidden) continue;
    object.traverseVisible((node) => {
      if (!(node instanceof T.Mesh)) return;
      const geometry = node.geometry;
      const position = geometry.getAttribute("position");
      if (!position || (geometry.index?.count ?? position.count) < 3) return;
      geometry.computeBoundingBox();
      if (geometry.boundingBox)
        box.union(geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
    });
  }
  return box;
}

/** Fits the bounding sphere to the narrower viewport axis without editing objects. */
export function fitCamera(
  camera: T.PerspectiveCamera | T.OrthographicCamera,
  box: T.Box3,
  direction: T.Vector3,
) {
  if (
    box.isEmpty() ||
    ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)
  )
    return null;
  const center = box.getCenter(new T.Vector3());
  const radius = Math.max(box.getSize(new T.Vector3()).length() / 2, 1e-6);
  let distance: number;
  if (camera instanceof T.PerspectiveCamera) {
    const vertical = T.MathUtils.degToRad(camera.getEffectiveFOV()) / 2;
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    distance = (radius * 1.15) / Math.sin(Math.min(vertical, horizontal));
  } else {
    camera.zoom =
      Math.min(camera.right - camera.left, camera.top - camera.bottom) /
      (2 * radius * 1.15);
    distance = radius * 3;
  }
  camera.near = Math.max(radius / 1000, 1e-9);
  camera.far = distance + radius * 1000;
  const offset =
    direction.lengthSq() > 0
      ? direction.clone().normalize()
      : new T.Vector3(1, 0.65, 1.4).normalize();
  camera.position.copy(center).addScaledVector(offset, distance);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return { center, radius };
}
