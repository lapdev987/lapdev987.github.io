import { describe, expect, test } from "bun:test";
import { advanceTour, groundTextureOffset, isOutsideResumeArea, mapPoint, nearbyStop, safeLink, steeringForCurve, updateCar, type CarState } from "../src/driving";
import { GROUND_SIZE, GROUND_TILE_SIZE } from "../src/scene-config";
import { WORLD_BOUNDS } from "../src/scene-config";

const initial: CarState = { x: 0, z: 0, heading: 0, speed: 0, steering: 0 };
const idle = { forward: false, reverse: false, left: false, right: false, brake: false };

describe("driving", () => {
  test("accelerates forward and caps speed", () => {
    let car = initial;
    for (let i = 0; i < 100; i++) car = updateCar(car, { ...idle, forward: true }, 0.05);
    expect(car.z).toBeGreaterThan(0);
    expect(car.speed).toBeLessThanOrEqual(17);
  });
  test("reverses and steers in the correct direction", () => {
    const car = updateCar({ ...initial, speed: -5 }, { ...idle, reverse: true, left: true }, 0.05);
    expect(car.z).toBeLessThan(0);
    expect(car.heading).toBeLessThan(0);
  });
  test("analog throttle and steering respond proportionally", () => {
    const partial = updateCar({ ...initial, speed: 5 }, { ...idle, throttle: 0.5, steering: 0.5 }, 0.05);
    const full = updateCar({ ...initial, speed: 5 }, { ...idle, throttle: 1, steering: 1 }, 0.05);
    expect(partial.speed).toBeCloseTo(5.3);
    expect(partial.steering).toBeGreaterThan(0);
    expect(partial.steering).toBeLessThan(full.steering);
    expect(partial.heading).toBeGreaterThan(0);
    expect(partial.heading).toBeLessThan(full.heading);
  });
  test("brakes and clamps frame time", () => {
    expect(updateCar({ ...initial, speed: 10 }, { ...idle, brake: true }, 0.05).speed).toBeLessThan(6);
    expect(updateCar(initial, { ...idle, forward: true }, 100).speed).toBeCloseTo(0.6);
  });
  test("crossing the mapped boundary does not clamp position or reduce speed", () => {
    const car = updateCar({ ...initial, z: WORLD_BOUNDS.z - 0.1, speed: 17 }, { ...idle, forward: true }, 0.05);
    expect(car.z).toBeGreaterThan(WORLD_BOUNDS.z);
    expect(car.speed).toBe(17);
    expect(isOutsideResumeArea(car)).toBe(true);
  });
  test("the same controls produce the same speed inside and far outside the map", () => {
    const inside = updateCar({ ...initial, speed: 10 }, { ...idle, forward: true }, 0.05);
    const outside = updateCar({ ...initial, x: 10000, z: -10000, speed: 10 }, { ...idle, forward: true }, 0.05);
    expect(outside.speed).toBe(inside.speed);
    expect(outside.x).toBe(10000);
    expect(outside.z).toBeGreaterThan(-10000);
    expect(isOutsideResumeArea(outside)).toBe(true);
  });
  test("front-wheel steering responds while parked and recenters after release", () => {
    let car = updateCar(initial, { ...idle, left: true }, 0.05);
    expect(car.steering).toBeGreaterThan(0);
    expect(car.heading).toBe(0);
    expect(car.speed).toBe(0);
    for (let i = 0; i < 25; i++) car = updateCar(car, idle, 0.05);
    expect(Math.abs(car.steering)).toBeLessThan(0.00001);
    expect(updateCar(initial, { ...idle, right: true }, 0.05).steering).toBeLessThan(0);
  });
  test("guided steering follows curve direction and handles angle wrapping", () => {
    expect(steeringForCurve(0.2, 2)).toBeGreaterThan(0);
    expect(steeringForCurve(-0.2, 2)).toBeLessThan(0);
    expect(steeringForCurve(-Math.PI * 2 + 0.1, 2)).toBeGreaterThan(0);
    expect(steeringForCurve(0, 2)).toBe(0);
  });
  test("repositioning the ground does not move its texture in world space", () => {
    const point = { x: 17.71, z: -41.4 };
    const wrap = (n: number) => (n % 1 + 1) % 1;
    const phase = (center: { x: number; z: number }) => {
      const offset = groundTextureOffset(center);
      return {
        u: wrap((point.x - center.x) / GROUND_TILE_SIZE + GROUND_SIZE / GROUND_TILE_SIZE / 2 + offset.x),
        v: wrap((center.z - point.z) / GROUND_TILE_SIZE + GROUND_SIZE / GROUND_TILE_SIZE / 2 + offset.y)
      };
    };
    const expected = phase({ x: 0, z: 0 });
    for (const center of [{ x: 503, z: -312 }, { x: 10000, z: -4000 }]) {
      expect(phase(center).u).toBeCloseTo(expected.u, 8);
      expect(phase(center).v).toBeCloseTo(expected.v, 8);
    }
  });
  test("only the minimap pointer is held at its edge during free roaming", () => {
    const point = mapPoint({ x: 10000, z: -10000 });
    expect(point.x).toBe(164);
    expect(point.y).toBe(12);
  });
  test("guided driving advances by speed times elapsed time and wraps forward", () => {
    expect(advanceTour(0.1, 10, 500, 0.05)).toBeCloseTo(0.101);
    expect(advanceTour(0.9995, 10, 500, 0.05)).toBeCloseTo(0.0005);
    expect(advanceTour(0.1, -10, 500, 0.05)).toBeCloseTo(0.1);
  });
  test("expanded world fits inside the minimap", () => {
    for (const x of [-WORLD_BOUNDS.x, 0, WORLD_BOUNDS.x]) {
      for (const z of [-WORLD_BOUNDS.z, 0, WORLD_BOUNDS.z]) {
        const point = mapPoint({ x, z });
        expect(point.x).toBeGreaterThan(0);
        expect(point.x).toBeLessThan(180);
        expect(point.y).toBeGreaterThan(0);
        expect(point.y).toBeLessThan(100);
      }
    }
  });
  test("detects nearby signs but does not repeatedly reopen a dismissed stop", () => {
    const stops = [{ x: 3, z: 0 }, { x: 20, z: 0 }];
    expect(nearbyStop(initial, stops, null)).toBe(0);
    expect(nearbyStop(initial, stops, 0)).toBe(-1);
    expect(nearbyStop({ x: 10, z: 0 }, stops, null)).toBe(-1);
  });
  test("does not permit executable, relative, or insecure project links", () => {
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("http://example.com")).toBeNull();
    expect(safeLink("/example")).toBeNull();
    expect(safeLink("https://example.com")).toBe("https://example.com/");
    expect(safeLink("mailto:hello@example.com")).toBe("mailto:hello@example.com");
  });
});
