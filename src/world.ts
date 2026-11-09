import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import carUrl from "./assets/ferrari.glb?url&inline";
import skyUrl from "./assets/dawn.hdr?url&inline";
import skyPreviewUrl from "./assets/dawn.jpg?url&inline";
import asphaltUrl from "./assets/asphalt-color.jpg?url&inline";
import normalUrl from "./assets/asphalt-normal.jpg?url&inline";
import roughnessUrl from "./assets/asphalt-roughness.jpg?url&inline";
import dracoWrapper from "three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?raw";
import dracoWasmUrl from "three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url&inline";
import { sections } from "./resume";
import { groundTextureOffset, steeringForCurve, type CarState } from "./driving";
import { GROUND_SIZE, GROUND_TILE_SIZE, MODEL_YAW_OFFSET, ROUTE_POINTS, ROUTE_SCALE, STOP_OFFSET } from "./scene-config";
import { createCaliperGeometry, createCarMaterials, splitLampLenses } from "./car-visuals";
import { WheelRig } from "./wheel-rig";

export interface Stop {
  x: number;
  z: number;
  label: THREE.Vector3;
  t: number;
}

/**
 * Realistic, ground-level scene. Model, PBR textures, HDRI and Draco decoder
 * are embedded by Vite: even the production file:// build needs no CDN.
 */
export class World {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(43, 1, 0.08, 700);
  car = new THREE.Group();
  route = new THREE.CatmullRomCurve3(
    ROUTE_POINTS.map(([x, z]) => new THREE.Vector3(x * ROUTE_SCALE, 0, z * ROUTE_SCALE)),
    true, "catmullrom", 0.35
  );
  stops: Stop[] = [];
  mode: "webgl" | "unavailable" = "unavailable";
  cameraMode: "follow" | "orbit" = "follow";
  ready: Promise<void>;
  assetReport = {
    modelLoaded: false, groundLoaded: false, environmentLoaded: false,
    triangles: 0, meshes: 0, wheels: 0, bodyPaint: "", modelYaw: MODEL_YAW_OFFSET,
    steerableWheels: 0, headlights: 0, projectorMeshes: 0,
    lensTriangles: 0, windowTriangles: 0, blackMeshes: 0,
    frontLensTriangles: 0, rearLensTriangles: 0,
    tailEmitterMeshes: 0, brakeDiscMeshes: 0, wheelHardwareMeshes: 0, calipers: 0,
    tailEmitterColor: "", brakeDiscMetalness: 0, brakeDiscRoughness: 0, caliperColor: "",
    paintRoughness: 0, clearcoatRoughness: 0, paintReflection: 0,
    modelSize: { width: 0, height: 0, length: 0 }
  };
  private renderer: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls;
  private wheels: THREE.Object3D[] = [];
  private wheelRigs: WheelRig[] = [];
  private ground: THREE.Mesh | null = null;
  private groundTextures: THREE.Texture[] = [];
  private boards: THREE.Group[] = [];
  private sunlight: THREE.DirectionalLight;
  private lastCarPosition = new THREE.Vector3();
  private initializedView = false;
  private disposed = false;
  private draco: DRACOLoader | null = null;

  constructor(public canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0x796664);
    this.scene.fog = new THREE.FogExp2(0x8d7972, 0.004);
    this.canvas.style.backgroundImage = `url("${skyPreviewUrl}")`;
    this.canvas.style.backgroundPosition = "center 43%";
    this.canvas.style.backgroundSize = "cover";
    this.createRenderer();
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 32;
    this.controls.minPolarAngle = 0.2;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.035;
    this.controls.addEventListener("start", () => { this.cameraMode = "orbit"; });

    this.scene.add(new THREE.HemisphereLight(0xf3d4c7, 0x2a2828, 1.25));
    this.sunlight = new THREE.DirectionalLight(0xffcfaa, 2.3);
    this.sunlight.position.set(-35, 65, -24);
    this.sunlight.castShadow = true;
    this.sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sunlight.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 160 });
    this.sunlight.shadow.bias = -0.00015;
    this.sunlight.shadow.normalBias = 0.025;
    this.sunlight.shadow.radius = 4;
    this.scene.add(this.sunlight, this.sunlight.target, this.car);
    this.buildStops();
    this.resize();
    this.canvas.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      this.mode = "unavailable";
      const warning = document.getElementById("graphics-warning");
      if (warning) warning.hidden = false;
    });
    this.ready = this.loadAssets();
  }

  private createRenderer() {
    try {
      const context = this.canvas.getContext("webgl2", { antialias: true, alpha: false });
      if (!context) { document.documentElement.dataset.renderer = this.mode; return; }
      const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, context, antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.95;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer = renderer;
      this.mode = "webgl";
    } catch (error) {
      console.warn("The realistic scene requires a working WebGL 2 context.", error);
    }
    document.documentElement.dataset.renderer = this.mode;
  }

  private progress(text: string) {
    const label = document.getElementById("loading-message");
    if (label) label.textContent = text;
  }

  private async loadAssets() {
    this.progress("Loading the car, asphalt and dawn light…");
    await Promise.all([this.loadCar(), this.loadGround(), this.loadEnvironment()]);
    this.scene.updateMatrixWorld(true);
    this.progress("Ready for the next chapter.");
  }

  private async loadCar() {
    const manager = new THREE.LoadingManager();
    const wrapperUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(dracoWrapper)}`;
    manager.setURLModifier(url => {
      if (url.endsWith("draco_wasm_wrapper.js")) return wrapperUrl;
      if (url.endsWith("draco_decoder.wasm")) return dracoWasmUrl;
      return url;
    });
    this.draco = new DRACOLoader(manager);
    this.draco.setDecoderPath("embedded-draco/").setDecoderConfig({ type: "wasm" }).setWorkerLimit(2);
    const loader = new GLTFLoader(manager).setDRACOLoader(this.draco);
    const response = await fetch(carUrl);
    if (!response.ok) throw new Error("The embedded car could not be read.");
    const gltf = await loader.parseAsync(await response.arrayBuffer(), "");
    const model = gltf.scene;
    const visual = new THREE.Group();
    visual.rotation.y = MODEL_YAW_OFFSET;
    visual.add(model);
    const box = new THREE.Box3().setFromObject(visual);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 4.6 / Math.max(size.x, size.z);
    this.assetReport.modelSize = { width: size.x * scale, height: size.y * scale, length: size.z * scale };
    visual.scale.setScalar(scale);
    visual.position.set(-center.x * scale, -box.min.y * scale + 0.025, -center.z * scale);
    this.car.add(visual);

    const materials = createCarMaterials();
    this.assetReport.paintRoughness = materials.paint.roughness;
    this.assetReport.clearcoatRoughness = materials.paint.clearcoatRoughness;
    this.assetReport.paintReflection = materials.paint.envMapIntensity;
    let projectors: THREE.Mesh | null = null;
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      this.assetReport.meshes++;
      this.assetReport.triangles += (object.geometry.index?.count || object.geometry.getAttribute("position").count) / 3;
      object.castShadow = true;
      object.receiveShadow = true;
      const name = object.name.toLowerCase();
      if (name === "body") {
        object.material = materials.paint;
        this.assetReport.bodyPaint = `#${materials.paint.color.getHexString(THREE.SRGBColorSpace)}`;
      }
      if (name.startsWith("rim_")) object.material = materials.rims;
      if (name === "glass") {
        const split = splitLampLenses(object, model);
        this.assetReport.lensTriangles += split.lensTriangles;
        this.assetReport.frontLensTriangles += split.frontLensTriangles;
        this.assetReport.rearLensTriangles += split.rearLensTriangles;
        this.assetReport.windowTriangles += split.windowTriangles;
        object.material = [materials.windows, materials.lenses, materials.rearLenses];
      }
      if (name === "lights_red") {
        object.material = materials.tailLamps;
        object.castShadow = false;
      }
      // Asset naming: plural "brakes" is the REAR LED array, not a wheel rotor.
      if (name === "brakes") {
        object.material = materials.tailEmitter;
        object.castShadow = false;
        this.assetReport.tailEmitterMeshes++;
        this.assetReport.tailEmitterColor = materials.tailEmitter.color.getHexString(THREE.SRGBColorSpace);
      }
      if (/^brake(?:_\d+)?$/.test(name)) {
        object.material = materials.brakeDiscs;
        this.assetReport.brakeDiscMeshes++;
        this.assetReport.brakeDiscMetalness = materials.brakeDiscs.metalness;
        this.assetReport.brakeDiscRoughness = materials.brakeDiscs.roughness;
      }
      if (/^wheel(?:_\d+)?$/.test(name)) {
        object.material = materials.wheelHardware;
        this.assetReport.wheelHardwareMeshes++;
      }
      if (name === "lights") {
        object.material = materials.projector;
        object.castShadow = false;
        this.assetReport.projectorMeshes++;
        projectors = object;
      }
      if (name === "leds") { object.material = materials.leds; object.castShadow = false; }
      if (name.startsWith("tire") || name === "grills") {
        object.material = materials.rubber;
        this.assetReport.blackMeshes++;
      } else if (name.includes("carbon") || ["plastic_gray", "interior_dark", "carpet", "leather", "steering_leather"].includes(name)) {
        object.material = materials.blackTrim;
        this.assetReport.blackMeshes++;
      }
    });
    const caliperGeometry = createCaliperGeometry();
    for (const name of ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"]) {
      const wheel = model.getObjectByName(name);
      if (wheel) {
        const left = wheel.position.x < 0;
        this.wheels.push(wheel);
        const rig = new WheelRig(wheel, name === "wheel_fl" || name === "wheel_fr");
        this.wheelRigs.push(rig);
        const caliper = new THREE.Mesh(caliperGeometry, materials.calipers);
        caliper.name = `${name}_caliper`;
        caliper.position.x = left ? 0.005 : 0.055;
        caliper.castShadow = true;
        caliper.receiveShadow = true;
        rig.addFixedAccessory(caliper);
        this.assetReport.calipers++;
        this.assetReport.caliperColor = materials.calipers.color.getHexString(THREE.SRGBColorSpace);
      }
    }
    this.assetReport.wheels = this.wheels.length;
    this.assetReport.steerableWheels = this.wheelRigs.filter(rig => rig.steerable).length;
    if (projectors) this.addHeadlights(projectors);
    this.assetReport.modelLoaded = true;
    this.draco.dispose();
    this.draco = null;
  }

  private async loadGround() {
    const loader = new THREE.TextureLoader();
    const [map, normal, roughness] = await Promise.all([
      loader.loadAsync(asphaltUrl), loader.loadAsync(normalUrl), loader.loadAsync(roughnessUrl)
    ]);
    map.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [map, normal, roughness]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(GROUND_SIZE / GROUND_TILE_SIZE, GROUND_SIZE / GROUND_TILE_SIZE);
      texture.anisotropy = this.renderer ? Math.min(8, this.renderer.capabilities.getMaxAnisotropy()) : 1;
    }
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
      new THREE.MeshStandardMaterial({
        color: 0x737477, map, normalMap: normal, normalScale: new THREE.Vector2(0.55, 0.55),
        roughnessMap: roughness, roughness: 0.95, metalness: 0.04
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;
    this.groundTextures = [map, normal, roughness];
    this.assetReport.groundLoaded = true;
  }

  private async loadEnvironment() {
    const hdri = await new RGBELoader().loadAsync(skyUrl);
    hdri.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.background = hdri;
    this.scene.backgroundBlurriness = 0.035;
    this.scene.backgroundIntensity = 0.72;
    this.scene.backgroundRotation.y = 0.55;
    this.scene.environmentRotation.y = 0.55;
    if (this.renderer) {
      const generator = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = generator.fromEquirectangular(hdri).texture;
      generator.dispose();
    } else this.scene.environment = hdri;
    this.assetReport.environmentLoaded = true;
  }

  private signTexture(name: string, number: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 320;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#eee8da";
    context.fillRect(0, 0, 1024, 320);
    context.fillStyle = "#b77b55";
    context.fillRect(0, 0, 13, 320);
    context.fillStyle = "#a67451";
    context.font = "500 44px Arial, sans-serif";
    context.fillText(`${number} / THE JOURNEY`, 60, 80);
    context.fillStyle = "#302d2b";
    context.font = "bold 91px Arial, sans-serif";
    context.fillText(name.toUpperCase(), 56, 224);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private buildStops() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x323132, metalness: 0.72, roughness: 0.32 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x77746f, roughness: 0.9 });
    const amber = new THREE.MeshStandardMaterial({ color: 0xc58d63, emissive: 0xbf7744, emissiveIntensity: 0.45, metalness: 0.35, roughness: 0.4 });
    sections.forEach((section, index) => {
      const point = this.route.getPointAt(section.t);
      const tangent = this.route.getTangentAt(section.t);
      const offset = new THREE.Vector3(tangent.z, 0, -tangent.x).multiplyScalar(STOP_OFFSET);
      const position = point.clone().add(offset);
      const height = 6.4 + index % 3 * 0.75;
      this.stops.push({ x: position.x, z: position.z, label: position.clone().setY(height + 0.4), t: section.t });
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, height, 0.26), metal);
      post.position.set(position.x, height / 2, position.z);
      post.castShadow = true;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.38, 0.95), concrete);
      base.position.set(position.x, 0.19, position.z);
      base.receiveShadow = true;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, height - 0.8, 0.28), amber);
      stripe.position.set(position.x + 0.14, height / 2, position.z);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), amber);
      beacon.position.set(position.x, height + 0.12, position.z);
      this.scene.add(post, base, stripe, beacon);

      const board = new THREE.Group();
      board.position.set(position.x, height - 1, position.z);
      const back = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.22, 0.14), metal);
      back.castShadow = true;
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(3.72, 1.15),
        new THREE.MeshStandardMaterial({
          map: this.signTexture(section.name, String(index + 1).padStart(2, "0")),
          roughness: 0.55, emissive: 0xeee8da, emissiveIntensity: 0.10,
          side: THREE.DoubleSide
        })
      );
      face.position.z = 0.08;
      board.add(back, face);
      this.boards.push(board);
      this.scene.add(board);

      // A recognizable octagonal stop sign below each chapter board.
      const stopCanvas = document.createElement("canvas");
      stopCanvas.width = stopCanvas.height = 256;
      const ctx = stopCanvas.getContext("2d")!;
      ctx.fillStyle = "#eee5d9"; ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#9d4e3c"; ctx.fillRect(10, 10, 236, 236);
      ctx.fillStyle = "#fff4e5"; ctx.textAlign = "center";
      ctx.font = "bold 56px Arial"; ctx.fillText("STOP", 128, 149);
      const texture = new THREE.CanvasTexture(stopCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const stop = new THREE.Mesh(
        new THREE.CircleGeometry(0.48, 8, Math.PI / 8),
        new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: 0.7 })
      );
      stop.position.y = -1.25; stop.position.z = 0.16;
      board.add(stop);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.45, 2.5, 64),
        new THREE.MeshBasicMaterial({ color: 0xd79a6c, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(position.x, 0.006, position.z);
      this.scene.add(ring);
    });
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.fov = innerWidth < 700 ? 53 : 43;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(innerWidth, innerHeight);
  }

  resetView() {
    this.cameraMode = "follow";
    this.initializedView = false;
  }

  toggleCamera() {
    this.cameraMode = this.cameraMode === "follow" ? "orbit" : "follow";
  }

  setCar(state: CarState, delta: number) {
    this.car.position.set(state.x, 0, state.z);
    this.car.rotation.y = state.heading;
    for (const rig of this.wheelRigs) rig.update(state.speed, state.steering, delta);
    if (this.ground) {
      this.ground.position.x = state.x;
      this.ground.position.z = state.z;
      const offset = groundTextureOffset(state);
      for (const texture of this.groundTextures) texture.offset.set(offset.x, offset.y);
    }
    this.car.updateMatrixWorld(true);
    const target = this.car.position.clone().add(new THREE.Vector3(0, 0.8, 0));
    if (this.cameraMode === "follow") {
      const offset = new THREE.Vector3(8.2, 4.1, -11.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.heading);
      const desired = this.car.position.clone().add(offset);
      const ease = 1 - Math.exp(-delta * 5);
      if (!this.initializedView) { this.camera.position.copy(desired); this.controls.target.copy(target); }
      else { this.camera.position.lerp(desired, ease); this.controls.target.lerp(target, ease); }
    } else {
      const movement = this.car.position.clone().sub(this.lastCarPosition);
      this.camera.position.add(movement);
      this.controls.target.copy(target);
    }
    this.lastCarPosition.copy(this.car.position);
    this.initializedView = true;
    this.controls.update();
    this.camera.updateMatrixWorld(true);
    // Follow shadows as the vehicle crosses the open world.
    this.sunlight.position.set(state.x - 35, 65, state.z - 24);
    this.sunlight.target.position.set(state.x, 0, state.z);
    this.sunlight.target.updateMatrixWorld();
    for (const board of this.boards) board.lookAt(this.camera.position.x, board.position.y, this.camera.position.z);
  }

  render() {
    if (!this.disposed && this.mode === "webgl") this.renderer?.render(this.scene, this.camera);
  }

  screenPoint(point: THREE.Vector3) {
    const p = point.clone().project(this.camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2, visible: p.z > -1 && p.z < 1 };
  }

  at(t: number): CarState {
    const wrapped = (t % 1 + 1) % 1;
    const point = this.route.getPointAt(wrapped);
    const tangent = this.route.getTangentAt(wrapped);
    return { x: point.x, z: point.z, heading: Math.atan2(tangent.x, tangent.z), speed: 0, steering: 0 };
  }

  steeringAt(t: number) {
    const step = 1 / this.route.getLength();
    const before = this.at(t - step).heading;
    const after = this.at(t + step).heading;
    return steeringForCurve(after - before, 2);
  }

  getVisualState() {
    return {
      frontWheelAngles: this.wheelRigs.filter(rig => rig.steerable).map(rig => rig.steeringPivot?.rotation.y ?? 0),
      rearWheelAngles: this.wheelRigs.filter(rig => !rig.steerable).map(rig => rig.steeringAngle),
      wheelRoll: this.wheelRigs.map(rig => rig.rollAngle),
      groundCenter: this.ground ? { x: this.ground.position.x, z: this.ground.position.z } : null,
      headlightPositions: this.car.children.filter(object => object instanceof THREE.SpotLight)
        .map(object => ({ x: object.position.x, y: object.position.y, z: object.position.z }))
    };
  }

  private addHeadlights(projectors: THREE.Mesh) {
    this.car.updateMatrixWorld(true);
    const toCar = this.car.matrixWorld.clone().invert().multiply(projectors.matrixWorld);
    const positions = projectors.geometry.getAttribute("position");
    const centers = [new THREE.Vector3(), new THREE.Vector3()];
    const counts = [0, 0];
    const point = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(toCar);
      const side = point.x < 0 ? 0 : 1;
      centers[side].add(point);
      counts[side]++;
    }
    const haloCanvas = document.createElement("canvas");
    haloCanvas.width = haloCanvas.height = 128;
    const context = haloCanvas.getContext("2d")!;
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(230,242,255,0.6)");
    gradient.addColorStop(0.2, "rgba(205,226,255,0.18)");
    gradient.addColorStop(1, "rgba(205,226,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const glowTexture = new THREE.CanvasTexture(haloCanvas);
    glowTexture.colorSpace = THREE.SRGBColorSpace;
    for (let side = 0; side < centers.length; side++) {
      if (!counts[side]) continue;
      const center = centers[side].multiplyScalar(1 / counts[side]);
      const light = new THREE.SpotLight(0xe9f2ff, 300, 60, Math.PI / 7, 0.65, 2);
      light.position.copy(center).add(new THREE.Vector3(0, 0, 0.04));
      const target = new THREE.Object3D();
      target.position.set(center.x, 0.05, center.z + 18);
      light.target = target;
      this.car.add(light, target);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture, transparent: true, opacity: 0.45,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
      }));
      halo.position.copy(light.position);
      halo.scale.set(0.38, 0.38, 1);
      this.car.add(halo);
      this.assetReport.headlights++;
    }
  }

  /** Actual nose direction derived from the loaded model's axle positions. */
  getModelForward() {
    if (this.wheels.length !== 4) return null;
    this.car.updateMatrixWorld(true);
    const position = (index: number) => this.wheels[index].getWorldPosition(new THREE.Vector3());
    const front = position(0).add(position(1)).multiplyScalar(0.5);
    const rear = position(2).add(position(3)).multiplyScalar(0.5);
    const forward = front.sub(rear);
    forward.y = 0;
    forward.normalize();
    return { x: forward.x, z: forward.z };
  }

  dispose() {
    this.disposed = true;
    this.controls.dispose();
    this.draco?.dispose();
    this.renderer?.dispose();
  }
}
