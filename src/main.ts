// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// ---------- Style sheets and other imports ----------
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./_leafletWorkaround.ts";

// Import luck function
import luck from "./_luck.ts";

// ---------- UI Elements ----------
const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

const dPad = document.createElement("div");
dPad.innerHTML = `
  <button class="up">⬆️</button>
  <button class="left">⬅️</button>
  <button class="right">➡️</button>
  <button class="down">⬇️</button>
`;
dPad.className = "d-pad";
document.body.appendChild(dPad);

// Create loading overlay
const loadingOverlay = document.createElement("div");
loadingOverlay.id = "loadingOverlay";
loadingOverlay.innerHTML = `
  <div id="loadingMessage">Getting your location…</div>
  <button id="retryGPS">Retry GPS</button>
`;
document.body.appendChild(loadingOverlay);

const loadingMessage = loadingOverlay.querySelector(
  "#loadingMessage",
) as HTMLDivElement;
const retryBtn = loadingOverlay.querySelector("#retryGPS") as HTMLButtonElement;

// Hide retry button initially
retryBtn.style.display = "none";

// Movement toggle button
const movementToggleBtn = document.createElement("button");
movementToggleBtn.id = "movementToggleBtn";
movementToggleBtn.textContent = "Switch to Manual Movement";
document.body.appendChild(movementToggleBtn);

// ---------- Coordinate System ----------
interface Point {
  i: number;
  j: number;
}

const renderedCells = new Map<string, Cell>();
const modifiedCells = new Map<string, Cell>();

function gridToLatLng(i: number, j: number): L.LatLng {
  return leaflet.latLng(
    SETTINGS.ORIGIN_LATLNG.lat + j * SETTINGS.TILE_SIZE,
    SETTINGS.ORIGIN_LATLNG.lng + i * SETTINGS.TILE_SIZE,
  );
}

function latLngToGrid(latlng: L.LatLng): Point {
  return {
    i: Math.floor(
      (latlng.lng - SETTINGS.ORIGIN_LATLNG.lng) / SETTINGS.TILE_SIZE,
    ),
    j: Math.floor(
      (latlng.lat - SETTINGS.ORIGIN_LATLNG.lat) / SETTINGS.TILE_SIZE,
    ),
  };
}

function cellBounds(x: number, y: number): L.LatLngBounds {
  return leaflet.latLngBounds(gridToLatLng(x, y), gridToLatLng(x + 1, y + 1));
}

// ---------- Settings ----------
const SETTINGS = {
  ORIGIN_LATLNG: leaflet.latLng(0, 0),
  TILE_SIZE: 1e-4,
  INTERACT_DISTANCE: 3,
  CELL_SPAWN_PROBABILITY: 0.1,
  GAMEPLAY_ZOOM_LEVEL: 19,
  WIN_SCORE: 64,
  IN_RANGE_OPACITY: 0.8,
  OUT_OF_RANGE_OPACITY: 0.3,
};

// ---------- Player State ----------
let playerValue = 0;
let playerWon = false;
let playerI = 0;
let playerJ = 0;
let playerLatLng = gridToLatLng(playerI, playerJ);

// ---------- Map Setup ----------
const map = leaflet.map(mapDiv, {
  center: SETTINGS.ORIGIN_LATLNG,
  zoom: SETTINGS.GAMEPLAY_ZOOM_LEVEL,
  minZoom: SETTINGS.GAMEPLAY_ZOOM_LEVEL,
  maxZoom: SETTINGS.GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const playerMarker = leaflet.marker(SETTINGS.ORIGIN_LATLNG);
playerMarker.bindTooltip("You");
playerMarker.addTo(map);

map.on("moveend", updateVisibleCells);

// ---------- Cell System ----------
interface Cell {
  i: number;
  j: number;
  value: number;
  element?: leaflet.Rectangle;
  popup?: HTMLDivElement;
}

class CellFactory {
  static create(i: number, j: number): Cell {
    const key = `${i},${j}`;
    if (modifiedCells.has(key)) return modifiedCells.get(key)!;
    const randomFloat = luck(`${i}:${j}:initialValue`);
    const value = randomFloat < 0.75 ? 2 : 4;
    return { i, j, value, element: null as unknown as leaflet.Rectangle };
  }

  static modify(cell: Cell) {
    const key = `${cell.i},${cell.j}`;
    modifiedCells.set(key, cell);
  }
}

// ---------- Popups ----------
function createPopupContent(cell: Cell): HTMLDivElement {
  const div = document.createElement("div");
  div.innerHTML = `
    <div>Cell: ${cell.i}, ${cell.j}. Value: <span id="value">${cell.value}</span></div>
    <button id="take">Take</button>
    <button id="place">Place</button>
  `;
  managePopup(cell, div);
  return div;
}

function managePopup(cell: Cell, popupDiv: HTMLDivElement) {
  popupDiv.querySelector("#take")!.addEventListener("click", () => {
    if (!withinRange(cell.i, cell.j)) return;
    if (playerValue === 0 && cell.value === 0) return;

    [playerValue, cell.value] = [cell.value, playerValue];
    CellFactory.modify(cell);

    if (playerValue === SETTINGS.WIN_SCORE) playerWon = true;

    popupDiv.querySelector("#value")!.textContent = cell.value.toString();
    updateCellAppearance(cell);
    updateStatus();
  });

  popupDiv.querySelector("#place")!.addEventListener("click", () => {
    if (!withinRange(cell.i, cell.j) || playerValue === 0) return;
    cell.value = cell.value === playerValue ? cell.value * 2 : playerValue;
    CellFactory.modify(cell);
    playerValue = 0;

    updateCellAppearance(cell);
    updateStatus();
    popupDiv.querySelector("#value")!.textContent = cell.value.toString();
  });
}

// ---------- Cell Management ----------
function updateVisibleCells() {
  const bounds = map.getBounds();
  const min = latLngToGrid(bounds.getSouthWest());
  const max = latLngToGrid(bounds.getNorthEast());
  const margin = 1;
  const visibleNow = new Set<string>();

  for (
    let i = Math.floor(min.i) - margin;
    i <= Math.ceil(max.i) + margin;
    i++
  ) {
    for (
      let j = Math.floor(min.j) - margin;
      j <= Math.ceil(max.j) + margin;
      j++
    ) {
      const key = `${i},${j}`;
      visibleNow.add(key);
      if (luck([i, j].toString()) >= SETTINGS.CELL_SPAWN_PROBABILITY) continue;
      if (renderedCells.has(key)) continue;

      const cell = CellFactory.create(i, j);
      const rectBounds = cellBounds(i, j);
      const element = leaflet.rectangle(rectBounds, {
        color: valueToColor(cell.value),
        weight: 1,
        fillOpacity: withinRange(i, j)
          ? SETTINGS.IN_RANGE_OPACITY
          : SETTINGS.OUT_OF_RANGE_OPACITY,
      }).addTo(map);

      cell.element = element;

      if (withinRange(i, j)) {
        if (!cell.popup) cell.popup = createPopupContent(cell);
        element.bindPopup(cell.popup);
      } else {
        element.bindTooltip("Too far away!", { permanent: false });
      }

      renderedCells.set(key, cell);
    }
  }

  for (const [key, cell] of renderedCells.entries()) {
    if (!visibleNow.has(key)) {
      cell.element?.removeFrom(map);
      renderedCells.delete(key);
    }
  }
}

function refreshCellInteractivity() {
  for (const [, cell] of renderedCells) {
    const inRange = withinRange(cell.i, cell.j);
    cell.element?.setStyle({
      fillOpacity: inRange
        ? SETTINGS.IN_RANGE_OPACITY
        : SETTINGS.OUT_OF_RANGE_OPACITY,
    });
    cell.element?.unbindPopup();
    cell.element?.unbindTooltip();

    if (inRange) {
      if (!cell.popup) cell.popup = createPopupContent(cell);
      cell.element?.bindPopup(cell.popup);
    } else {
      cell.element?.bindTooltip("Too far away!", { permanent: false });
    }
  }
}

function withinRange(i: number, j: number) {
  return i <= playerI + SETTINGS.INTERACT_DISTANCE &&
    i >= playerI - SETTINGS.INTERACT_DISTANCE &&
    j <= playerJ + SETTINGS.INTERACT_DISTANCE &&
    j >= playerJ - SETTINGS.INTERACT_DISTANCE;
}

function valueToColor(value: number) {
  const hue = (Math.log2(value) * 45) % 360;
  const lightness = 70 - Math.min(Math.log2(value), 6) * 5;
  return `hsl(${hue}, 100%, ${lightness}%)`;
}

function updateCellAppearance(cell: Cell) {
  cell.element?.setStyle({
    color: valueToColor(cell.value),
    fillOpacity: withinRange(cell.i, cell.j)
      ? SETTINGS.IN_RANGE_OPACITY
      : SETTINGS.OUT_OF_RANGE_OPACITY,
  });
}

function updateStatus() {
  statusPanelDiv.innerHTML = playerWon
    ? "Congrats! You won!"
    : `Current token value: ${playerValue} <br><br> Win if holding: ${SETTINGS.WIN_SCORE}`;
}

function updatePlayerMarker() {
  playerLatLng = gridToLatLng(playerI, playerJ);
  playerMarker.setLatLng(playerLatLng);
}

// ---------- Player Movement Facade ----------
interface MovementController {
  start(): void;
  stop(): void;
  onMove(callback: (i: number, j: number) => void): void;
}

class GPSMovement implements MovementController {
  private moveCallback: (i: number, j: number) => void = () => {};
  private watchId: number | null = null;

  onMove(callback: (i: number, j: number) => void): void {
    this.moveCallback = callback;
  }

  start(): void {
    if (!navigator.geolocation) return;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p = latLngToGrid(
          leaflet.latLng(pos.coords.latitude, pos.coords.longitude),
        );
        this.moveCallback(p.i, p.j);
      },
      (err) => console.warn("GPS error:", err),
      { enableHighAccuracy: true },
    );
  }

  stop(): void {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

class ManualMovement implements MovementController {
  private moveCallback: (i: number, j: number) => void = () => {};
  private enabled = false;

  constructor(private dPadElement: HTMLElement) {
    // Attach button listeners once in the constructor
    this.dPadElement.querySelector(".up")?.addEventListener("click", () => {
      if (this.enabled) this.moveCallback(0, +1);
    });
    this.dPadElement.querySelector(".down")?.addEventListener("click", () => {
      if (this.enabled) this.moveCallback(0, -1);
    });
    this.dPadElement.querySelector(".left")?.addEventListener("click", () => {
      if (this.enabled) this.moveCallback(-1, 0);
    });
    this.dPadElement.querySelector(".right")?.addEventListener("click", () => {
      if (this.enabled) this.moveCallback(+1, 0);
    });
  }

  onMove(callback: (i: number, j: number) => void): void {
    this.moveCallback = callback;
  }

  start(): void {
    this.enabled = true;
    this.dPadElement.style.display = "grid"; // show the D-pad
  }

  stop(): void {
    this.enabled = false;
    this.dPadElement.style.display = "none"; // hide the D-pad
  }
}

class PlayerMovementFacade {
  private gpsController: MovementController;
  private manualController: MovementController;
  private activeController: MovementController;
  private currentMode: "gps" | "manual" = "gps"; // track current mode

  constructor(dPadElement: HTMLElement) {
    this.gpsController = new GPSMovement();
    this.manualController = new ManualMovement(dPadElement);
    this.activeController = this.gpsController;

    // All controllers report movement through here:
    this.gpsController.onMove((i, j) => this.applyMovement(i, j, false));
    this.manualController.onMove((di, dj) => this.applyMovement(di, dj, true));
  }

  private applyMovement(i: number, j: number, isDelta: boolean) {
    if (isDelta) {
      playerI += i;
      playerJ += j;
    } else {
      playerI = i;
      playerJ = j;
    }

    updatePlayerMarker();
    updateVisibleCells();
    refreshCellInteractivity();
    updateStatus();
  }

  setMode(mode: "gps" | "manual") {
    this.activeController.stop();
    this.activeController = mode === "gps"
      ? this.gpsController
      : this.manualController;
    this.currentMode = mode;
    this.activeController.start();
  }

  getMode(): "gps" | "manual" {
    return this.currentMode;
  }
}

// ---------- Movement Toggle ----------
const movementFacade = new PlayerMovementFacade(dPad);
movementFacade.setMode("gps");

// Add logic to movement toggle button
movementToggleBtn.addEventListener("click", () => {
  if (movementFacade.getMode() === "gps") {
    // Switch to manual
    movementFacade.setMode("manual");
    movementToggleBtn.textContent = "Switch to GPS Movement";
  } else {
    // Switch to GPS
    movementFacade.setMode("gps");
    movementToggleBtn.textContent = "Switch to Manual Movement";
  }
});

// ---------- GPS Retry ----------
retryBtn.addEventListener("click", () => {
  loadingMessage.textContent = "Retrying…";
  retryBtn.style.display = "none";
  requestGPS();
});

function requestGPS() {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const p = latLngToGrid(
        leaflet.latLng(position.coords.latitude, position.coords.longitude),
      );
      playerI = p.i;
      playerJ = p.j;
      playerLatLng = leaflet.latLng(
        position.coords.latitude,
        position.coords.longitude,
      );
      updatePlayerMarker();
      updateVisibleCells();
      refreshCellInteractivity();
      updateStatus();
      document.getElementById("loadingOverlay")?.remove();
      map.setView(playerLatLng);
    },
    (_error) => {
      loadingMessage.textContent = "Unable to get location. Please enable GPS.";
      retryBtn.style.display = "inline-block";
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
  );
}

// ---------- Center Map Button ----------
const centerBtn = document.createElement("button");
centerBtn.id = "centerBtn";
centerBtn.textContent = "Center on Player";
document.body.appendChild(centerBtn);

centerBtn.addEventListener("click", () => {
  centerView(true, 0.4);
});

function centerView(animateMap: boolean, moveDuration: number) {
  map.setView(playerLatLng, SETTINGS.GAMEPLAY_ZOOM_LEVEL, {
    animate: animateMap,
    duration: moveDuration,
  });
}

// ---------- Initial Calls ----------
updateVisibleCells();
updateStatus();
requestGPS();
