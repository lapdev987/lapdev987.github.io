import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { sections } from "../src/resume";
import { CAR_COLOR, MODEL_YAW_OFFSET, ROUTE_POINTS, ROUTE_SCALE, STOP_OFFSET, WORLD_BOUNDS } from "../src/scene-config";

/** Read the real GLB's node transforms; geometry decompression is not required. */
function assetSkeleton() {
  const bytes = readFileSync(new URL("../src/assets/ferrari.glb", import.meta.url));
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const nodes: THREE.Object3D[] = json.nodes.map((node: {
    name?: string; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[];
  }) => {
    const object = new THREE.Object3D();
    object.name = node.name || "";
    if (node.matrix) new THREE.Matrix4().fromArray(node.matrix).decompose(object.position, object.quaternion, object.scale);
    else {
      if (node.translation) object.position.fromArray(node.translation);
      if (node.rotation) object.quaternion.fromArray(node.rotation);
      if (node.scale) object.scale.fromArray(node.scale);
    }
    return object;
  });
  json.nodes.forEach((node: { children?: number[] }, index: number) =>
    node.children?.forEach(child => nodes[index].add(nodes[child])));
  const scene = new THREE.Group();
  json.scenes[json.scene || 0].nodes.forEach((index: number) => scene.add(nodes[index]));
  scene.updateMatrixWorld(true);
  return scene;
}

function nose(scene: THREE.Object3D) {
  const point = (name: string) => scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
  return point("wheel_fl").add(point("wheel_fr"))
    .sub(point("wheel_rl")).sub(point("wheel_rr")).normalize();
}

const curve = (scale: number) => new THREE.CatmullRomCurve3(
  ROUTE_POINTS.map(([x, z]) => new THREE.Vector3(x * scale, 0, z * scale)),
  true, "catmullrom", 0.35
);
const markers = (route: THREE.CatmullRomCurve3) => sections.map(section => {
  const tangent = route.getTangentAt(section.t);
  return route.getPointAt(section.t).add(new THREE.Vector3(tangent.z, 0, -tangent.x).multiplyScalar(STOP_OFFSET));
});
const spacing = (points: THREE.Vector3[]) => Math.min(...points.flatMap((point, i) =>
  points.slice(i + 1).map(other => point.distanceTo(other))));

describe("real model direction and expanded layout", () => {
  test("the original asset really faces -Z; the corrected model faces +Z", () => {
    const asset = assetSkeleton();
    expect(nose(asset).z).toBeLessThan(-0.999);
    const visual = new THREE.Group();
    visual.rotation.y = MODEL_YAW_OFFSET;
    visual.add(asset); visual.updateMatrixWorld(true);
    expect(nose(visual).z).toBeGreaterThan(0.999);
  });
  test("the model's nose aligns with guided travel around the whole route", () => {
    const car = new THREE.Group();
    const visual = new THREE.Group();
    visual.rotation.y = MODEL_YAW_OFFSET;
    visual.add(assetSkeleton()); car.add(visual);
    const route = curve(ROUTE_SCALE);
    for (let i = 0; i < 100; i++) {
      const tangent = route.getTangentAt(i / 100);
      car.rotation.y = Math.atan2(tangent.x, tangent.z);
      car.updateMatrixWorld(true);
      expect(nose(car).dot(tangent)).toBeGreaterThan(0.999);
      const movement = route.getPointAt(i / 100 + 0.0001).sub(route.getPointAt(i / 100));
      expect(movement.dot(nose(car))).toBeGreaterThan(0);
    }
  });
  test("the wider stops are separated and remain reachable within the map", () => {
    const expanded = markers(curve(ROUTE_SCALE));
    expect(spacing(expanded)).toBeGreaterThan(35);
    expect(spacing(expanded)).toBeGreaterThan(spacing(markers(curve(1))) * 2);
    for (const point of expanded) {
      expect(Math.abs(point.x)).toBeLessThan(WORLD_BOUNDS.x);
      expect(Math.abs(point.z)).toBeLessThan(WORLD_BOUNDS.z);
    }
  });
  test("paint is configured as red", () => {
    expect(CAR_COLOR).toBe(0xd41320);
  });
});
