import "./style.css";
import { profile, sections, type ResumeCard } from "./resume";
import { World } from "./world";
import { advanceTour, distanceTo, isOutsideResumeArea, mapPoint, nearbyStop, safeLink, updateCar, type CarState } from "./driving";
import { GUIDED_SPEED } from "./scene-config";
import threeLicense from "./assets/three-LICENSE.txt?raw";
import dracoLicense from "./assets/draco-LICENSE.txt?raw";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const detailDialog = $<HTMLDialogElement>("detail-dialog");
const resumeDialog = $<HTMLDialogElement>("resume-dialog");
const creditsDialog = $<HTMLDialogElement>("credits-dialog");
const keys = new Set<string>();
const visited = new Set<number>();
let world: World;
let car: CarState;
let driving = false;
let tour = false;
let tourT = 0.03;
let currentSection = 0;
let ignoredStop: number | null = null;
let lastTime = 0;
let arrivalTimer: ReturnType<typeof setTimeout> | undefined;
let lastFocused: HTMLElement | null = null;
let dialogWasTour = false;
let assetsReady = false;

function renderCard(card: ResumeCard) {
  const article = document.createElement("article");
  article.className = "resume-card";
  const title = document.createElement("h3");
  title.textContent = card.title;
  article.append(title);
  if (card.meta) {
    const meta = document.createElement("p");
    meta.className = "card-meta"; meta.textContent = card.meta;
    article.append(meta);
  }
  const description = document.createElement("p");
  description.textContent = card.description;
  article.append(description);
  if (card.tags?.length) {
    const tags = document.createElement("div");
    tags.className = "tags";
    card.tags.forEach(text => {
      const tag = document.createElement("span");
      tag.className = "tag"; tag.textContent = text; tags.append(tag);
    });
    article.append(tags);
  }
  const href = safeLink(card.url);
  if (href) {
    const link = document.createElement("a");
    link.className = "card-link"; link.href = href;
    link.textContent = `${card.linkLabel || "Open link"} ↗`;
    if (href.startsWith("https:")) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
    article.append(link);
  }
  return article;
}

function start(takeTour = false) {
  driving = true;
  $("hero").hidden = true;
  $("trip-info").hidden = false;
  $("touch-controls").hidden = window.innerWidth >= 700;
  document.documentElement.dataset.driving = "true";
  if (takeTour) {
    car = world.at(tourT);
    tour = true;
  }
  updateTourButton();
}

function updateTourButton() {
  $("tour-toggle").textContent = tour ? "Pause tour · Take the wheel ↗" : "Start guided drive →";
  $("trip-description").textContent = tour
    ? "Sit back. We’ll stop at each chapter.\nClose a section to continue the drive."
    : "Drive toward a tall stop sign.\nA chapter opens when you get close.";
  $("trip-description").style.whiteSpace = "pre-line";
}

function markVisited(index: number) {
  visited.add(index);
  $("visited-count").textContent = `${visited.size} / 6 stops`;
  document.querySelector(`[data-stop="${index}"]`)?.classList.add("visited");
  const dot = document.querySelector(`#map-stops [data-index="${index}"] circle:last-child`);
  dot?.setAttribute("fill", "#d99161");
}

function openSection(index: number, jump = false) {
  if (resumeDialog.open) resumeDialog.close();
  if (jump) {
    start(false);
    tour = false;
    tourT = sections[index].t;
    car = world.at(tourT);
    world.setCar(car, 0);
    world.render();
    updateTourButton();
  }
  car.speed = 0;
  keys.clear();
  currentSection = index;
  ignoredStop = index;
  dialogWasTour = tour;
  markVisited(index);
  const section = sections[index];
  $("detail-eyebrow").textContent = `${String(index + 1).padStart(2, "0")} / ${section.subtitle}`;
  $("detail-title").textContent = section.name;
  $("detail-intro").textContent = section.intro;
  $("section-position").textContent = `Stop ${index + 1} of ${sections.length}`;
  const content = $("detail-content");
  content.replaceChildren();
  if (profile.isTemplate) {
    const label = document.createElement("div");
    label.className = "sample-label"; label.textContent = "Sample content · Make this yours";
    content.append(label);
  }
  section.cards.forEach(card => content.append(renderCard(card)));
  $("next-section").firstChild!.textContent = index === sections.length - 1 ? "Back to About " : "Next stop ";
  if (!detailDialog.open) {
    lastFocused = document.activeElement as HTMLElement;
    detailDialog.showModal();
  }
  detailDialog.scrollTop = 0;
}

function closeSection() {
  detailDialog.close();
}

function openResume() {
  if (detailDialog.open) detailDialog.close();
  keys.clear(); car.speed = 0;
  dialogWasTour = tour;
  lastFocused = document.activeElement as HTMLElement;
  resumeDialog.showModal();
}

function setupResume() {
  $("resume-title").textContent = profile.name;
  $("resume-subtitle").textContent = profile.headline;
  if (!profile.isTemplate) {
    document.querySelector(".template-notice")?.remove();
    document.querySelector(".template-callout")?.remove();
  }
  const content = $("resume-content");
  sections.forEach(section => {
    const block = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = section.name;
    block.append(heading);
    section.cards.forEach(card => block.append(renderCard(card)));
    content.append(block);
  });
}

function setupCredits() {
  const notices = document.createElement("details");
  notices.className = "license-notices";
  const summary = document.createElement("summary");
  summary.textContent = "Open-source license notices";
  const text = document.createElement("pre");
  text.textContent = `Three.js — MIT License\n\n${threeLicense}\n\nDraco — Apache License 2.0\n\n${dracoLicense}`;
  notices.append(summary, text);
  creditsDialog.append(notices);
}

function reset() {
  if (detailDialog.open) detailDialog.close();
  if (resumeDialog.open) resumeDialog.close();
  keys.clear();
  ignoredStop = null;
  tour = false; tourT = 0.03;
  car = world.at(tourT);
  world.resetView();
  updateTourButton();
  $("arrival").hidden = true;
}

function makeLabels() {
  const container = $("stop-labels");
  sections.forEach((section, i) => {
    const button = document.createElement("button");
    button.className = "stop-label";
    button.dataset.stop = String(i);
    button.style.setProperty("--section-color", section.color);
    button.setAttribute("aria-label", `Go to ${section.name}, stop ${i + 1}`);
    const number = document.createElement("span");
    number.className = "number";
    number.textContent = String(i + 1).padStart(2, "0");
    const name = document.createElement("span");
    name.textContent = section.name;
    button.append(number, name);
    button.addEventListener("click", () => openSection(i, true));
    container.append(button);
  });
  positionLabels();
}

function positionLabels() {
  world.stops.forEach((stop, i) => {
    const position = world.screenPoint(stop.label);
    const button = document.querySelector(`[data-stop="${i}"]`) as HTMLElement;
    button.style.left = `${position.x}px`;
    button.style.top = `${position.y}px`;
    button.hidden = world.mode !== "webgl" || !position.visible || position.x < 25 || position.x > window.innerWidth - 25 || position.y < 105 || position.y > innerHeight - 100;
  });
}

function setupMap() {
  const points = world.route.getSpacedPoints(80).map(mapPoint);
  const path = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";
  document.getElementById("map-road")!.setAttribute("d", path);
  document.getElementById("map-road-border")!.setAttribute("d", path);
  const ns = "http://www.w3.org/2000/svg";
  world.stops.forEach((stop, i) => {
    const point = mapPoint(stop);
    const group = document.createElementNS(ns, "g");
    group.setAttribute("role", "button"); group.setAttribute("tabindex", "0");
    group.setAttribute("aria-label", `Map: ${sections[i].name}`);
    group.dataset.index = String(i);
    const hitArea = document.createElementNS(ns, "circle");
    hitArea.setAttribute("cx", String(point.x)); hitArea.setAttribute("cy", String(point.y));
    hitArea.setAttribute("r", "8"); hitArea.setAttribute("fill", "#332e2a");
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", String(point.x)); dot.setAttribute("cy", String(point.y));
    dot.setAttribute("r", "3.5"); dot.setAttribute("fill", "#b99778");
    dot.setAttribute("stroke", "#332e2a"); dot.setAttribute("stroke-width", "1.5");
    group.append(hitArea, dot);
    group.addEventListener("click", () => openSection(i, true));
    group.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openSection(i, true); }
    });
    document.getElementById("map-stops")!.append(group);
  });
}

function updateMap() {
  const point = mapPoint(car);
  for (const id of ["map-car", "map-car-halo"]) {
    const dot = document.getElementById(id)!;
    dot.setAttribute("cx", String(point.x)); dot.setAttribute("cy", String(point.y));
  }
}

function showArrival(text: string) {
  $("arrival").textContent = text;
  $("arrival").hidden = false;
  clearTimeout(arrivalTimer);
  arrivalTimer = setTimeout(() => { $("arrival").hidden = true; }, 2200);
}

function tick(time: number) {
  const delta = Math.min((time - lastTime) / 1000 || 0, 0.05);
  lastTime = time;
  const paused = detailDialog.open || resumeDialog.open || creditsDialog.open || document.hidden;
  if (driving && assetsReady && !paused) {
    if (tour) {
      tourT = advanceTour(tourT, GUIDED_SPEED, world.route.getLength(), delta);
      car = { ...world.at(tourT), speed: GUIDED_SPEED, steering: world.steeringAt(tourT) };
    } else {
      car = updateCar(car, {
        forward: keys.has("ArrowUp") || keys.has("KeyW"),
        reverse: keys.has("ArrowDown") || keys.has("KeyS"),
        left: keys.has("ArrowLeft") || keys.has("KeyA"),
        right: keys.has("ArrowRight") || keys.has("KeyD"),
        brake: keys.has("Space")
      }, delta);
    }
    if (ignoredStop !== null && distanceTo(car, world.stops[ignoredStop]) > 6.5) ignoredStop = null;
    const near = nearbyStop(car, world.stops, ignoredStop);
    if (near >= 0) {
      showArrival(`You’ve arrived at ${sections[near].name}.`);
      openSection(near);
    }
  }
  world.setCar(car, delta);
  if (!document.hidden) world.render();
  positionLabels();
  updateMap();
  const outside = isOutsideResumeArea(car);
  const boundaryWarning = $("boundary-warning");
  if (boundaryWarning.hidden !== !outside) boundaryWarning.hidden = !outside;
  $("camera-label").textContent = world.cameraMode === "follow" ? "FOLLOW CAM" : "ORBIT CAM";
  $("speed").textContent = paused ? "PARKED AT A STOP" : tour ? "GUIDED TOUR" : Math.abs(car.speed) < 0.1 ? "PARKED & READY" : `${Math.round(Math.abs(car.speed) * 4)} KM/H${car.speed < 0 ? " · REVERSE" : ""}`;
  requestAnimationFrame(tick);
}

function setupControls() {
  $("start-button").addEventListener("click", () => start());
  $("tour-button").addEventListener("click", () => start(true));
  $("tour-toggle").addEventListener("click", () => {
    if (tour) { tour = false; car.speed = 0; }
    else {
      // Rejoin the closest route point instead of jumping back to the start.
      let best = Infinity;
      for (let i = 0; i < 200; i++) {
        const point = world.at(i / 200);
        const distance = distanceTo(car, point);
        if (distance < best) { best = distance; tourT = i / 200; }
      }
      tour = true;
    }
    updateTourButton();
  });
  $("reset-button").addEventListener("click", reset);
  $("camera-button").addEventListener("click", () => world.toggleCamera());
  $("fullscreen-button").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { showArrival("Fullscreen isn’t available in this browser view."); }
  });
  $("credits-button").addEventListener("click", () => {
    keys.clear();
    lastFocused = document.activeElement as HTMLElement;
    creditsDialog.showModal();
  });
  $("close-credits").addEventListener("click", () => creditsDialog.close());
  $("home-link").addEventListener("click", event => {
    event.preventDefault();
    reset(); driving = false;
    $("hero").hidden = false; $("trip-info").hidden = true; $("touch-controls").hidden = true;
  });
  document.querySelectorAll<HTMLButtonElement>("[data-section]").forEach(button =>
    button.addEventListener("click", () => openSection(Number(button.dataset.section), true)));
  $("resume-button").addEventListener("click", openResume);
  $("fallback-resume-button").addEventListener("click", openResume);
  $("close-resume").addEventListener("click", () => resumeDialog.close());
  $("close-detail").addEventListener("click", closeSection);
  $("next-section").addEventListener("click", () => {
    const next = (currentSection + 1) % sections.length;
    if (dialogWasTour) {
      tourT = sections[currentSection].t + 0.025;
      car = world.at(tourT);
      detailDialog.close();
    } else openSection(next, true);
  });
  [detailDialog, resumeDialog, creditsDialog].forEach(dialog => {
    dialog.addEventListener("close", () => {
      keys.clear();
      lastFocused?.focus({ preventScroll: true });
    });
    dialog.addEventListener("click", event => {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  });
  window.addEventListener("keydown", event => {
    if (detailDialog.open || resumeDialog.open || creditsDialog.open || !assetsReady) return;
    if (event.code === "KeyR") { reset(); return; }
    if (event.code === "KeyV") { world.resetView(); return; }
    if (event.code === "KeyC") { world.toggleCamera(); return; }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "Space"].includes(event.code)) {
      // Space/arrow activation on a focused control should remain accessible.
      if (document.activeElement?.matches("button, a, [role=button]") && event.code === "Space") return;
      event.preventDefault();
      if (!driving) start();
      tour = false; updateTourButton();
      keys.add(event.code);
    }
  });
  window.addEventListener("keyup", event => keys.delete(event.code));
  window.addEventListener("blur", () => keys.clear());
  document.addEventListener("visibilitychange", () => keys.clear());
  document.querySelectorAll<HTMLButtonElement>("[data-key]").forEach(button => {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      tour = false; updateTourButton();
      keys.add(button.dataset.key!);
      button.classList.add("pressed");
    });
    const release = () => { keys.delete(button.dataset.key!); button.classList.remove("pressed"); };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });
  window.addEventListener("resize", () => {
    world.resize(); positionLabels();
    $("touch-controls").hidden = !driving || window.innerWidth >= 700;
  });
  window.addEventListener("pagehide", event => { if (!event.persisted) world.dispose(); });
}

try {
  world = new World($<HTMLCanvasElement>("world"));
  car = world.at(tourT);
  world.setCar(car, 0);
  setupResume(); setupCredits(); makeLabels(); setupMap(); setupControls();
  world.ready.then(() => {
    assetsReady = true;
    $("loading").hidden = true;
    $("graphics-warning").hidden = world.mode === "webgl";
    $("car-caption").hidden = world.mode !== "webgl";
    positionLabels();
  }).catch(error => {
    $("loading").hidden = true;
    $("graphics-warning").hidden = false;
    $("graphics-warning").querySelector("h2")!.textContent = "One of the embedded assets couldn’t load.";
    $("graphics-warning").querySelector("p")!.textContent = "The complete résumé still works. Please reopen the HTML in Chrome or check the browser console for the asset-loading error.";
    console.error("Drivefolio asset loading failed:", error);
  });
  requestAnimationFrame(tick);
} catch (error) {
  $("loading").hidden = true;
  $("graphics-warning").hidden = false;
  if (!$("resume-content").childElementCount) setupResume();
  $("resume-button").addEventListener("click", () => resumeDialog.showModal());
  $("close-resume").addEventListener("click", () => resumeDialog.close());
  console.error("Drivefolio initialization failed:", error);
}

// Read-only diagnostics make the local prototype inspectable without hidden controls.
Object.defineProperty(window, "drivefolio", {
  get: () => ({
    car: { ...car }, renderer: world?.mode, driving, tour,
    visited: [...visited], currentSection, dialogOpen: detailDialog.open,
    stopPositions: world?.stops.map(stop => ({ x: stop.x, z: stop.z })),
    assetsReady, assets: world ? { ...world.assetReport } : null,
    cameraMode: world?.cameraMode, modelForward: world?.getModelForward(),
    outsideResumeArea: car ? isOutsideResumeArea(car) : false, visualState: world?.getVisualState()
  })
});
