import { GROUND_TILE_SIZE, MAX_STEERING, WORLD_BOUNDS, WHEELBASE } from "./scene-config";

export interface CarState { x: number; z: number; heading: number; speed: number; steering: number }
export interface DrivingInput { forward: boolean; reverse: boolean; left: boolean; right: boolean; brake: boolean; throttle?: number; steering?: number }

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const distanceTo = (car: Pick<CarState, "x" | "z">, point: { x: number; z: number }) =>
  Math.hypot(car.x - point.x, car.z - point.z);

export function updateCar(car: CarState, input: DrivingInput, delta: number): CarState {
  const dt = clamp(delta, 0, 0.05);
  let speed = car.speed;
  const throttle = clamp(input.throttle ?? Number(input.forward) - Number(input.reverse), -1, 1);
  if (throttle !== 0) speed += 12 * throttle * dt;
  else speed *= Math.exp(-1.3 * dt);
  if (input.brake) speed *= Math.exp(-12 * dt);
  speed = clamp(speed, -7, 17);
  if (Math.abs(speed) < 0.035) speed = 0;
  const steering = clamp(input.steering ?? Number(input.left) - Number(input.right), -1, 1);
  const wheelAngle = car.steering + (steering * MAX_STEERING - car.steering) * (1 - Math.exp(-10 * dt));
  const heading = car.heading + steering * 1.65 * dt * clamp(speed / 5, -1, 1);
  const x = car.x + Math.sin(heading) * speed * dt;
  const z = car.z + Math.cos(heading) * speed * dt;
  return { x, z, heading, speed, steering: wheelAngle };
}

export function isOutsideResumeArea(car: Pick<CarState, "x" | "z">) {
  return Math.abs(car.x) > WORLD_BOUNDS.x || Math.abs(car.z) > WORLD_BOUNDS.z;
}

export function steeringForCurve(headingChange: number, distance: number) {
  if (distance <= 0) return 0;
  const turn = Math.atan2(Math.sin(headingChange), Math.cos(headingChange));
  return clamp(Math.atan(WHEELBASE * turn / distance), -MAX_STEERING, MAX_STEERING);
}

/** Keep the moving ground's texture locked to world coordinates. */
export function groundTextureOffset(center: { x: number; z: number }) {
  const wrap = (n: number) => (n % 1 + 1) % 1;
  return { x: wrap(center.x / GROUND_TILE_SIZE), y: wrap(-center.z / GROUND_TILE_SIZE) };
}

/** Travel a real distance along the route, keeping wheels and motion in sync. */
export function advanceTour(t: number, speed: number, routeLength: number, delta: number) {
  if (routeLength <= 0) return (t % 1 + 1) % 1;
  const next = t + Math.max(0, speed) * clamp(delta, 0, 0.05) / routeLength;
  return (next % 1 + 1) % 1;
}

export function mapPoint(point: { x: number; z: number }) {
  return {
    x: 90 + clamp(point.x / WORLD_BOUNDS.x, -1, 1) * 74,
    y: 50 + clamp(point.z / WORLD_BOUNDS.z, -1, 1) * 38
  };
}

export function nearbyStop(car: Pick<CarState, "x" | "z">, stops: { x: number; z: number }[], ignored: number | null, radius = 4.8): number {
  return stops.findIndex((stop, index) => index !== ignored && distanceTo(car, stop) < radius);
}

export function safeLink(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "mailto:" ? parsed.href : null;
  } catch { return null; }
}
