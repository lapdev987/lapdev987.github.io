/** Shared scene dimensions and vehicle conventions, in metres/radians. */
export const CAR_COLOR = 0xd41320;
// The original Ferrari's front axle lies along -Z. Driving uses +Z forward.
export const MODEL_YAW_OFFSET = Math.PI;
export const ROUTE_SCALE = 2.4;
export const STOP_OFFSET = 3.4;
export const GUIDED_SPEED = 10;
export const MAX_STEERING = 0.5;
export const WHEEL_RADIUS = 0.34;
export const WHEELBASE = 2.65;
export const GROUND_SIZE = 2000;
export const GROUND_TILE_SIZE = 3.75;
// Navigation-area dimensions only: these are not driving limits.
export const WORLD_BOUNDS = { x: 100, z: 85 } as const;
export const ROUTE_POINTS: readonly (readonly [number, number])[] = [
  [0, 0], [15, 13], [29, 0], [18, -20],
  [-8, -22], [-28, -8], [-23, 18], [0, 24]
];
