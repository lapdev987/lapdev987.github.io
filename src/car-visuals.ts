import * as THREE from "three";
import { CAR_COLOR } from "./scene-config";

/** Separate materials: more paint reflection must not wash out black trim. */
export function createCarMaterials() {
  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: CAR_COLOR, metalness: 0.18, roughness: 0.095,
      clearcoat: 1, clearcoatRoughness: 0.025, envMapIntensity: 1.65, ior: 1.52
    }),
    rims: new THREE.MeshStandardMaterial({
      color: 0xabb2bb, metalness: 0.9, roughness: 0.23, envMapIntensity: 1.2
    }),
    windows: new THREE.MeshPhysicalMaterial({
      color: 0x080d13, metalness: 0, roughness: 0.025,
      transparent: true, opacity: 0.58, depthWrite: false,
      envMapIntensity: 0.65, clearcoat: 1, clearcoatRoughness: 0.02,
      side: THREE.DoubleSide
    }),
    lenses: new THREE.MeshPhysicalMaterial({
      color: 0xf5faff, metalness: 0, roughness: 0.015,
      transparent: true, opacity: 0.12, depthWrite: false,
      envMapIntensity: 0.4, clearcoat: 1, clearcoatRoughness: 0.01,
      side: THREE.DoubleSide
    }),
    rearLenses: new THREE.MeshPhysicalMaterial({
      color: 0x9c0a17, metalness: 0, roughness: 0.12,
      transparent: true, opacity: 0.2, depthWrite: false,
      envMapIntensity: 0.08, clearcoat: 0.35, clearcoatRoughness: 0.07,
      side: THREE.DoubleSide
    }),
    blackTrim: new THREE.MeshStandardMaterial({
      color: 0x020304, metalness: 0.02, roughness: 0.4, envMapIntensity: 0.14
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: 0x040406, metalness: 0, roughness: 0.94, envMapIntensity: 0.05
    }),
    projector: new THREE.MeshStandardMaterial({
      color: 0xf1f6ff, emissive: 0xe9f2ff, emissiveIntensity: 3,
      roughness: 0.12, metalness: 0.05, toneMapped: false
    }),
    leds: new THREE.MeshStandardMaterial({
      color: 0xf6faff, emissive: 0xe5efff, emissiveIntensity: 4,
      roughness: 0.15, toneMapped: false
    }),
    tailLamps: new THREE.MeshPhysicalMaterial({
      color: 0x80040d, metalness: 0, roughness: 0.26,
      emissive: 0x420108, emissiveIntensity: 0.25, envMapIntensity: 0.08,
      clearcoat: 0.4, clearcoatRoughness: 0.06,
      transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide
    }),
    // Unlit LED color is not whitened/oranged by HDR lighting or tone mapping.
    tailEmitter: new THREE.MeshBasicMaterial({
      color: 0xff0716, toneMapped: false, side: THREE.DoubleSide
    }),
    brakeDiscs: new THREE.MeshStandardMaterial({
      color: 0x777b80, metalness: 0.9, roughness: 0.52, envMapIntensity: 0.45
    }),
    wheelHardware: new THREE.MeshStandardMaterial({
      color: 0x4c535a, metalness: 0.8, roughness: 0.38, envMapIntensity: 0.55
    }),
    calipers: new THREE.MeshPhysicalMaterial({
      color: 0xb41622, metalness: 0.15, roughness: 0.38,
      clearcoat: 0.5, clearcoatRoughness: 0.08, envMapIntensity: 0.4
    })
  };
}

/**
 * The asset combines windshield/window glass and lamp covers in one mesh.
 * Re-index triangles into window, front-lens and rear-lens draw groups.
 * The centre rear engine window remains tinted, not red.
 * Coordinates are in the unrotated source-model space, whose nose is -Z.
 */
export function splitLampLenses(mesh: THREE.Mesh, model: THREE.Object3D) {
  model.updateWorldMatrix(true, true);
  const toModel = model.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  // Locate the actual rear LED arrays instead of tinting the whole rear window.
  const rearMasks = [
    { x: -0.73, y: 0.88, radius: 0.2, zMin: 1.7, zMax: 2.3 },
    { x: 0.73, y: 0.88, radius: 0.2, zMin: 1.7, zMax: 2.3 }
  ];
  const rearEmitter = model.getObjectByName("brakes");
  if (rearEmitter instanceof THREE.Mesh) {
    const emitterToModel = model.matrixWorld.clone().invert().multiply(rearEmitter.matrixWorld);
    const emitterPositions = rearEmitter.geometry.getAttribute("position");
    const boxes = [new THREE.Box3(), new THREE.Box3()];
    const vertex = new THREE.Vector3();
    for (let i = 0; i < emitterPositions.count; i++) {
      vertex.fromBufferAttribute(emitterPositions, i).applyMatrix4(emitterToModel);
      boxes[vertex.x < 0 ? 0 : 1].expandByPoint(vertex);
    }
    boxes.forEach((box, index) => {
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      rearMasks[index] = {
        x: center.x, y: center.y, radius: Math.max(size.x, size.y) / 2 + 0.05,
        zMin: box.min.z - 0.08, zMax: box.max.z + 0.12
      };
    });
  }
  const geometry = mesh.geometry.clone();
  const positions = geometry.getAttribute("position");
  const indices = geometry.index;
  const count = indices ? indices.count : positions.count;
  const windowIndices: number[] = [];
  const frontLensIndices: number[] = [];
  const rearLensIndices: number[] = [];
  const center = new THREE.Vector3();
  const point = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map(offset => indices ? indices.getX(i + offset) : i + offset);
    center.set(0, 0, 0);
    for (const vertex of triangle) {
      point.fromBufferAttribute(positions, vertex).applyMatrix4(toModel);
      center.add(point);
    }
    center.multiplyScalar(1 / 3);
    const frontLens = center.z < -1.2 && center.y < 1;
    const rearLens = Math.abs(center.x) > 0.55 && center.y < 1.05 && rearMasks.some(mask =>
      center.z > mask.zMin && center.z < mask.zMax &&
      (center.x - mask.x) ** 2 + (center.y - mask.y) ** 2 < mask.radius ** 2);
    const target = frontLens ? frontLensIndices : rearLens ? rearLensIndices : windowIndices;
    target.push(...triangle);
  }
  geometry.setIndex([...windowIndices, ...frontLensIndices, ...rearLensIndices]);
  geometry.clearGroups();
  if (windowIndices.length) geometry.addGroup(0, windowIndices.length, 0);
  if (frontLensIndices.length) geometry.addGroup(windowIndices.length, frontLensIndices.length, 1);
  if (rearLensIndices.length) geometry.addGroup(windowIndices.length + frontLensIndices.length, rearLensIndices.length, 2);
  mesh.geometry = geometry;
  mesh.castShadow = false;
  return {
    lensTriangles: (frontLensIndices.length + rearLensIndices.length) / 3,
    frontLensTriangles: frontLensIndices.length / 3,
    rearLensTriangles: rearLensIndices.length / 3,
    windowTriangles: windowIndices.length / 3
  };
}

/** Small rounded caliper detail around the rotor's outer edge; axle is X. */
export function createCaliperGeometry() {
  const shape = new THREE.Shape();
  const outer = 0.245, inner = 0.183, angle = 0.48;
  shape.moveTo(Math.cos(-angle) * outer, Math.sin(-angle) * outer);
  shape.absarc(0, 0, outer, -angle, angle, false);
  shape.lineTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
  shape.absarc(0, 0, inner, angle, -angle, true);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.06, bevelEnabled: true, bevelSize: 0.007,
    bevelThickness: 0.007, bevelSegments: 2, steps: 1, curveSegments: 12
  });
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}
