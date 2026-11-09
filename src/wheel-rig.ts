import * as THREE from "three";
import { MAX_STEERING, WHEEL_RADIUS } from "./scene-config";

/** A vertical steering pivot above the wheel's original axle/roll transform. */
export class WheelRig {
  readonly steeringPivot: THREE.Group | null;
  readonly mount: THREE.Group;
  private readonly restQuaternion: THREE.Quaternion;
  private readonly rollQuaternion = new THREE.Quaternion();
  private readonly axle = new THREE.Vector3(1, 0, 0);
  rollAngle = 0;
  steeringAngle = 0;

  constructor(readonly wheel: THREE.Object3D, readonly steerable: boolean) {
    this.restQuaternion = wheel.quaternion.clone();
    this.mount = new THREE.Group();
    this.mount.name = `${wheel.name}_mount`;
    if (wheel.parent) {
      this.mount.position.copy(wheel.position);
      wheel.parent.add(this.mount);
      this.mount.add(wheel);
      wheel.position.set(0, 0, 0);
    }
    this.steeringPivot = steerable ? this.mount : null;
  }

  update(speed: number, steering: number, delta: number) {
    this.rollAngle -= speed * Math.max(0, Math.min(delta, 0.05)) / WHEEL_RADIUS;
    this.rollQuaternion.setFromAxisAngle(this.axle, this.rollAngle);
    this.wheel.quaternion.copy(this.restQuaternion).multiply(this.rollQuaternion);
    this.steeringAngle = this.steerable ? Math.max(-MAX_STEERING, Math.min(MAX_STEERING, steering)) : 0;
    if (this.steeringPivot) this.steeringPivot.rotation.y = this.steeringAngle;
  }

  /** Calipers follow the steering knuckle, but never spin with the rotor. */
  addFixedAccessory(object: THREE.Object3D) {
    this.mount.add(object);
  }
}
