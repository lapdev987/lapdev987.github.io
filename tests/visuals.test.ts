import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { createCaliperGeometry, createCarMaterials, splitLampLenses } from "../src/car-visuals";
import { WheelRig } from "../src/wheel-rig";

function wheelFixture() {
  const normalized = new THREE.Group();
  normalized.rotation.y = Math.PI;
  const parent = new THREE.Group();
  normalized.add(parent);
  const wheel = new THREE.Group();
  wheel.name = "wheel_fl";
  wheel.position.set(-0.84256, 0.358, -1.155);
  wheel.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  parent.add(wheel);
  normalized.updateMatrixWorld(true);
  return { normalized, wheel };
}

describe("wheel steering and roll", () => {
  test("steering pivots stay at the axle while wheel roll continues", () => {
    const { normalized, wheel } = wheelFixture();
    const position = wheel.getWorldPosition(new THREE.Vector3());
    const rest = wheel.quaternion.clone();
    const rig = new WheelRig(wheel, true);
    rig.update(5, 0.4, 0.05);
    normalized.updateMatrixWorld(true);
    expect(wheel.getWorldPosition(new THREE.Vector3()).distanceTo(position)).toBeLessThan(0.000001);
    expect(rig.steeringPivot!.rotation.y).toBeCloseTo(0.4);
    expect(wheel.quaternion.angleTo(rest)).toBeGreaterThan(0.05);
    const axle = new THREE.Vector3(1, 0, 0).applyQuaternion(wheel.getWorldQuaternion(new THREE.Quaternion()));
    const forward = new THREE.Vector3(0, 1, 0).cross(axle).normalize();
    expect(forward.x).toBeGreaterThan(0.3);
    expect(forward.z).toBeGreaterThan(0.9);
    const roll = rig.rollAngle;
    rig.update(5, -0.4, 0.05);
    expect(rig.steeringPivot!.rotation.y).toBeCloseTo(-0.4);
    expect(rig.rollAngle).toBeLessThan(roll);
  });
  test("rear wheels roll without steering", () => {
    const { wheel } = wheelFixture();
    const rig = new WheelRig(wheel, false);
    rig.update(5, 0.5, 0.05);
    expect(rig.steeringPivot).toBeNull();
    expect(rig.steeringAngle).toBe(0);
    expect(rig.rollAngle).toBeLessThan(0);
  });
  test("front wheels can steer while stationary", () => {
    const { wheel } = wheelFixture();
    const rig = new WheelRig(wheel, true);
    rig.update(0, 0.5, 0.05);
    expect(rig.steeringPivot!.rotation.y).toBe(0.5);
    expect(rig.rollAngle).toBe(0);
  });
  test("calipers follow steering without rolling with the wheel", () => {
    const { normalized, wheel } = wheelFixture();
    const rig = new WheelRig(wheel, true);
    const caliper = new THREE.Object3D();
    caliper.position.z = 0.2;
    rig.addFixedAccessory(caliper);
    rig.update(5, 0.3, 0.05);
    normalized.updateMatrixWorld(true);
    const before = caliper.getWorldQuaternion(new THREE.Quaternion());
    const wheelBefore = wheel.quaternion.clone();
    rig.update(5, 0.3, 0.05);
    normalized.updateMatrixWorld(true);
    expect(caliper.getWorldQuaternion(new THREE.Quaternion()).angleTo(before)).toBeLessThan(0.000001);
    expect(wheel.quaternion.angleTo(wheelBefore)).toBeGreaterThan(0.05);
    expect(rig.mount.rotation.y).toBeCloseTo(0.3);
  });
});

describe("car finish and lamp materials", () => {
  test("paint stays glossy without over-amplified mirror reflections", () => {
    const materials = createCarMaterials();
    expect(materials.paint.roughness).toBeGreaterThan(0.06);
    expect(materials.paint.roughness).toBeLessThan(0.16);
    expect(materials.paint.clearcoat).toBe(1);
    expect(materials.paint.clearcoatRoughness).toBeGreaterThan(0.015);
    expect(materials.paint.clearcoatRoughness).toBeLessThan(0.05);
    expect(materials.paint.envMapIntensity).toBeGreaterThan(1);
    expect(materials.paint.envMapIntensity).toBeLessThan(2);
    expect(materials.paint.color.getHexString(THREE.SRGBColorSpace)).toBe("d41320");
  });
  test("black trim and rubber do not use light-gray carbon materials", () => {
    const materials = createCarMaterials();
    expect(materials.blackTrim.color.getHexString(THREE.SRGBColorSpace)).toBe("020304");
    expect(materials.blackTrim.envMapIntensity).toBeLessThan(0.2);
    expect(materials.rubber.metalness).toBe(0);
    expect(materials.rubber.roughness).toBeGreaterThan(0.9);
  });
  test("projectors emit light through clear lenses, not tinted window glass", () => {
    const materials = createCarMaterials();
    expect(materials.projector.emissiveIntensity).toBeGreaterThanOrEqual(3);
    expect(materials.projector.toneMapped).toBe(false);
    expect(materials.lenses.transparent).toBe(true);
    expect(materials.lenses.opacity).toBeLessThan(0.2);
    expect(materials.lenses.color.r).toBeGreaterThan(0.5);
    expect(materials.windows.color.r).toBeLessThan(0.01);
  });
  test("rear emitters remain red independently of HDR lighting and tone mapping", () => {
    const materials = createCarMaterials();
    expect(materials.tailEmitter.type).toBe("MeshBasicMaterial");
    expect(materials.tailEmitter.color.getHexString(THREE.SRGBColorSpace)).toBe("ff0716");
    expect(materials.tailEmitter.toneMapped).toBe(false);
    expect(materials.tailLamps.transparent).toBe(true);
    expect(materials.tailLamps.opacity).toBeLessThan(0.5);
    expect(materials.rearLenses.color.r).toBeGreaterThan(materials.rearLenses.color.g * 10);
    expect(materials.rearLenses.envMapIntensity).toBeLessThan(0.1);
  });
  test("discs use brushed metal and calipers are red but not emissive", () => {
    const materials = createCarMaterials();
    expect(materials.brakeDiscs.metalness).toBeGreaterThan(0.8);
    expect(materials.brakeDiscs.roughness).toBeGreaterThan(0.4);
    expect(materials.calipers.color.getHexString(THREE.SRGBColorSpace)).toBe("b41622");
    expect(materials.calipers.emissive.getHex()).toBe(0);
    const geometry = createCaliperGeometry();
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.getSize(new THREE.Vector3()).x).toBeLessThan(0.1);
  });
  test("lamp triangles are separated in original model space after normalization", () => {
    const outer = new THREE.Group();
    outer.rotation.y = Math.PI;
    outer.position.set(7, 0, 5);
    const model = new THREE.Group();
    outer.add(model);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      -1.8, 0.65, -0.1, -1.8, 0.7, 0.1, -1.7, 0.75, 0,
      -0.5, 1.1, -0.1, -0.5, 1.15, 0.1, -0.4, 1.2, 0
    ], 3));
    const mesh = new THREE.Mesh(geometry);
    mesh.rotation.y = -Math.PI / 2;
    model.add(mesh);
    const counts = splitLampLenses(mesh, model);
    expect(counts.lensTriangles).toBe(1);
    expect(counts.windowTriangles).toBe(1);
    expect(mesh.geometry.index!.count).toBe(6);
    expect(mesh.geometry.groups.length).toBe(2);
    expect(geometry.index).toBeNull();
    expect(mesh.castShadow).toBe(false);
  });
  test("rear lamp covers are separated without reddening the central engine window", () => {
    const model = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      0.7, 0.8, 1.9, 0.75, 0.9, 1.96, 0.8, 0.85, 2.02,
      0.0, 0.85, 1.9, 0.1, 0.9, 1.95, -0.1, 0.95, 2.0,
      0.7, 0.65, -1.8, 0.75, 0.7, -1.8, 0.8, 0.75, -1.7
    ], 3));
    const mesh = new THREE.Mesh(geometry);
    model.add(mesh);
    const counts = splitLampLenses(mesh, model);
    expect(counts.rearLensTriangles).toBe(1);
    expect(counts.frontLensTriangles).toBe(1);
    expect(counts.windowTriangles).toBe(1);
    expect(mesh.geometry.groups.map(group => group.materialIndex)).toEqual([0, 1, 2]);
    expect(mesh.geometry.index!.count).toBe(9);
  });
  test("a wide rear emitter cannot cause red tint on the central engine window", () => {
    const model = new THREE.Group();
    const emitters = new THREE.BufferGeometry();
    emitters.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.85, 0.79, 1.83, -0.01, 0.96, 2.15,
      0.01, 0.79, 1.83, 0.85, 0.96, 2.15
    ], 3));
    const emitter = new THREE.Mesh(emitters);
    emitter.name = "brakes";
    model.add(emitter);
    const glass = new THREE.BufferGeometry();
    glass.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.1, 0.85, 1.9, 0.1, 0.9, 1.95, 0, 0.95, 2
    ], 3));
    const window = new THREE.Mesh(glass);
    model.add(window);
    const counts = splitLampLenses(window, model);
    expect(counts.rearLensTriangles).toBe(0);
    expect(counts.windowTriangles).toBe(1);
  });
});
