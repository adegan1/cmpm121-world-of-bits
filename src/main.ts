// ================================
//          IMPORTS
// ================================
// Type support for Leaflet
// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// CSS and supporting scripts
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts"; // fix for missing Leaflet images
import luck from "./_luck.ts";
import "./style.css";

// ================================
//           UI ELEMENTS
// ================================
// Control panel init
const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

// Map init
const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

// Status panel init
const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

// D-pad init for manual movement
const dPad = document.createElement("div");
dPad.className = "d-pad";
dPad.innerHTML = `
  <button class="up">⬆️</button>
  <button class="left">⬅️</button>
  <button class="right">➡️</button>
  <button class="down">⬇️</button>
`;
document.body.appendChild(dPad);

// Loading overlay for GPS
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
retryBtn.style.display = "none"; // Initially hidden

// Win Modal Overlay
const winModal = document.createElement("div");
winModal.id = "winModal";
winModal.innerHTML = `
  <div class="win-content">
    <h2>🎉 You Win!</h2>
    <p>The challenge intensifies...</p>
    <button id="continueBtn">Continue to 2048</button>
  </div>
`;
document.body.appendChild(winModal);

// Movement toggle button
const movementToggleBtn = document.createElement("button");
movementToggleBtn.id = "movementToggleBtn";
document.body.appendChild(movementToggleBtn);

// Reset button
const resetBtn = document.createElement("button");
resetBtn.id = "resetBtn";
resetBtn.textContent = "Reset Game";
document.body.appendChild(resetBtn);

// Center-on-player button
const centerBtn = document.createElement("button");
centerBtn.id = "centerBtn";
centerBtn.textContent = "Center on Player";
document.body.appendChild(centerBtn);

// Continue button when player wins
document.getElementById("continueBtn")!.addEventListener("click", () => {
  winScore = SETTINGS.FINAL_SCORE; // New target
  gamePaused = false;
  playerWon = false;
  winModal.classList.remove("active");

  updateStatus();
});

// ================================
//          GAME SETTINGS
// ================================
const SETTINGS = {
  ORIGIN_LATLNG: leaflet.latLng(0, 0),
  TILE_SIZE: 1e-4,
  INTERACT_DISTANCE: 3,
  CELL_SPAWN_PROBABILITY: 0.1,
  GAMEPLAY_ZOOM_LEVEL: 19,
  FINAL_SCORE: 2048,
  IN_RANGE_OPACITY: 0.8,
  OUT_OF_RANGE_OPACITY: 0.3,
};

// ================================
//        COORDINATE HELPERS
// ================================
interface Point {
  i: number;
  j: number;
}

// Function to change grid location to lat lng
function gridToLatLng(i: number, j: number): L.LatLng {
  return leaflet.latLng(
    SETTINGS.ORIGIN_LATLNG.lat + j * SETTINGS.TILE_SIZE,
    SETTINGS.ORIGIN_LATLNG.lng + i * SETTINGS.TILE_SIZE,
  );
}

// Function to lat lng location to grid location
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

// Get the cell's bounding box
function cellBounds(x: number, y: number): L.LatLngBounds {
  return leaflet.latLngBounds(gridToLatLng(x, y), gridToLatLng(x + 1, y + 1));
}

// ================================
//          PLAYER STATE
// ================================
let playerI = 0;
let playerJ = 0;
let playerLatLng = gridToLatLng(playerI, playerJ);
let playerValue = 0;
let playerWon = false;
let gamePaused = false;

let winScore = 64;

// ================================
//            MAP SETUP
// ================================
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

// Player marker
const playerMarker = leaflet.marker(SETTINGS.ORIGIN_LATLNG).addTo(map);
playerMarker.bindTooltip("You");

// ================================
//          CELL LOGIC
// ================================
interface Cell {
  i: number;
  j: number;
  value: number;
  element?: leaflet.Rectangle;
  popup?: HTMLDivElement;
}

const renderedCells = new Map<string, Cell>();
const modifiedCells = new Map<string, Cell>();

class CellFactory {
  static create(i: number, j: number): Cell {
    const key = `${i},${j}`;
    if (modifiedCells.has(key)) return modifiedCells.get(key)!;
    const value = luck(`${i}:${j}:initialValue`) < 0.75 ? 2 : 4;
    return { i, j, value, element: null as unknown as leaflet.Rectangle };
  }

  static modify(cell: Cell) {
    modifiedCells.set(`${cell.i},${cell.j}`, cell);
  }
}

// ================================
//        POPUP LOGIC
// ================================
function createPopupContent(cell: Cell): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "cell-popup";
  div.innerHTML = `
    <div class="cell-value">${cell.value}</div>
    <button class="take">Take</button>
    <button class="place">Place</button>
  `;

  const valueDiv = div.querySelector<HTMLDivElement>(".cell-value");
  if (valueDiv) {
    valueDiv.textContent = cell.value.toString();
    valueDiv.style.backgroundClip = "text";
    valueDiv.style.color = getValueColor(cell.value);
  }

  // Stop popup from closing on button click
  div.addEventListener("click", (e) => e.stopPropagation());

  managePopup(cell, div);
  return div;
}

function managePopup(cell: Cell, popupDiv: HTMLDivElement) {
  popupDiv.querySelector(".take")!.addEventListener("click", () => {
    if (gamePaused) return;

    if (!withinRange(cell.i, cell.j)) return;
    if (playerValue === 0 && cell.value === 0) return;

    [playerValue, cell.value] = [cell.value, playerValue];
    CellFactory.modify(cell);

    checkForWin();

    updateCellAppearance(cell);
    updateStatus();
    saveGameState();
  });

  popupDiv.querySelector(".place")!.addEventListener("click", () => {
    if (gamePaused) return;

    if (!withinRange(cell.i, cell.j) || playerValue === 0) return;

    cell.value = cell.value === playerValue ? cell.value * 2 : playerValue;
    CellFactory.modify(cell);

    playerValue = 0;

    updateCellAppearance(cell);
    updateStatus();
    saveGameState();
  });
}

// Check to see if the player has won
function checkForWin() {
  if (playerValue === winScore && !gamePaused) {
    playerWon = true;
    gamePaused = true;
    winModal.classList.add("active"); // Show popup
  }
}

// ================================
//         CELL RENDERING
// ================================
// Update cells when finished moving map
map.on("moveend", updateVisibleCells);

// Update all cells on screen
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
      const element = leaflet.rectangle(cellBounds(i, j), {
        color: valueToColor(cell.value),
        weight: 1,
        fillOpacity: withinRange(i, j)
          ? SETTINGS.IN_RANGE_OPACITY
          : SETTINGS.OUT_OF_RANGE_OPACITY,
      }).addTo(map);

      cell.element = element;

      if (withinRange(i, j)) {
        if (!cell.popup) cell.popup = createPopupContent(cell);
        element.bindPopup(() => createPopupContent(cell), {
          autoClose: true,
          closeOnClick: true,
          closeOnEscapeKey: true,
        });
      } else {
        element.bindTooltip("Too far away!", { permanent: false });
      }

      renderedCells.set(key, cell);
    }
  }

  // Remove cells outside visible area
  for (const [key, cell] of renderedCells.entries()) {
    if (!visibleNow.has(key)) {
      cell.element?.removeFrom(map);
      renderedCells.delete(key);
    }
  }
}

// Update interactable cells
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
      cell.element?.bindPopup(() => createPopupContent(cell), {
        autoClose: true,
        closeOnClick: true,
        closeOnEscapeKey: true,
      });
    } else {
      cell.element?.bindTooltip("Too far away!", { permanent: false });
    }
  }
}

// Check if a cell is within range of the player
function withinRange(i: number, j: number) {
  return i <= playerI + SETTINGS.INTERACT_DISTANCE &&
    i >= playerI - SETTINGS.INTERACT_DISTANCE &&
    j <= playerJ + SETTINGS.INTERACT_DISTANCE &&
    j >= playerJ - SETTINGS.INTERACT_DISTANCE;
}

// Get a color depending on the cell's value
function valueToColor(value: number) {
  const hue = (Math.log2(value) * 45) % 360;
  const lightness = 70 - Math.min(Math.log2(value), 6) * 5;
  return `hsl(${hue}, 100%, ${lightness}%)`;
}

// Get color for text
function getValueColor(value: number): string {
  const hue = (Math.log2(value) * 45) % 360; // Spin around color wheel
  return `hsl(${hue}, 80%, 45%)`;
}

// Update cell appearance
function updateCellAppearance(cell: Cell) {
  if (!cell.element) return;

  const popup = cell.element.getPopup();
  if (popup) {
    popup.setContent(createPopupContent(cell));
    popup.update();
  }

  cell.element.setStyle({
    color: valueToColor(cell.value),
    fillOpacity: withinRange(cell.i, cell.j)
      ? SETTINGS.IN_RANGE_OPACITY
      : SETTINGS.OUT_OF_RANGE_OPACITY,
  });
}

// Close popups when clicking on the map
map.on("click", () => {
  if (map.hasLayer(playerMarker.getPopup()!)) {
    playerMarker.getPopup()?.remove();
  }
  for (const [, cell] of renderedCells) {
    const popup = cell.element?.getPopup();
    if (popup && map.hasLayer(popup)) {
      cell.element?.closePopup();
    }
  }
});

// ================================
//         STATUS PANEL
// ================================
let lastPlayerValue = -1;

function updateStatus() {
  if (playerWon) {
    statusPanelDiv.innerHTML = "🎉 Congrats! You won!";
    return;
  }

  statusPanelDiv.innerHTML =
    `Current token value: <span class="token-value">${playerValue}</span><br><br>Win if holding: ${winScore}`;

  const valueSpan = statusPanelDiv.querySelector<HTMLSpanElement>(
    ".token-value",
  );
  if (valueSpan) {
    // Animate on change
    if (playerValue !== lastPlayerValue) {
      valueSpan.style.transform = "scale(1.3)";
      setTimeout(() => valueSpan.style.transform = "scale(1)", 150);
    }
  }

  // Update held token value color
  const tokenSpan = statusPanelDiv.querySelector(
    ".token-value",
  ) as HTMLSpanElement;
  tokenSpan.textContent = playerValue.toString();
  tokenSpan.style.color = getValueColor(playerValue);
  tokenSpan.style.fontWeight = "800";

  // Add some animation
  tokenSpan.style.transform = "scale(1.2)";
  setTimeout(() => (tokenSpan.style.transform = "scale(1)"), 150);

  lastPlayerValue = playerValue;
}

// ================================
//          PLAYER MOVEMENT
// ================================
interface MovementController {
  start(): void;
  stop(): void;
  onMove(callback: (i: number, j: number) => void): void;
}

// GPS-based movement
class GPSMovement implements MovementController {
  private moveCallback: (i: number, j: number) => void = () => {};
  private watchId: number | null = null;

  onMove(cb: (i: number, j: number) => void) {
    this.moveCallback = cb;
  }

  start() {
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

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

// Manual movement via D-pad
class ManualMovement implements MovementController {
  private moveCallback: (i: number, j: number) => void = () => {};
  private enabled = false;

  constructor(private dPadElement: HTMLElement) {
    this.dPadElement.querySelector(".up")?.addEventListener("click", () => {
      if (gamePaused) return;
      if (this.enabled) this.moveCallback(0, 1);
    });
    this.dPadElement.querySelector(".down")?.addEventListener("click", () => {
      if (gamePaused) return;
      if (this.enabled) this.moveCallback(0, -1);
    });
    this.dPadElement.querySelector(".left")?.addEventListener("click", () => {
      if (gamePaused) return;
      if (this.enabled) this.moveCallback(-1, 0);
    });
    this.dPadElement.querySelector(".right")?.addEventListener("click", () => {
      if (gamePaused) return;
      if (this.enabled) this.moveCallback(1, 0);
    });
  }

  onMove(cb: (i: number, j: number) => void) {
    this.moveCallback = cb;
  }

  start() {
    this.enabled = true;
    this.dPadElement.style.display = "grid";
  }
  stop() {
    this.enabled = false;
    this.dPadElement.style.display = "none";
  }
}

// Facade to manage movement mode
class PlayerMovementFacade {
  private gps: MovementController;
  private manual: MovementController;
  private active: MovementController;
  private currentMode: "gps" | "manual" = "gps";

  constructor(dPadEl: HTMLElement) {
    this.gps = new GPSMovement();
    this.manual = new ManualMovement(dPadEl);
    this.active = this.gps;

    this.gps.onMove((i, j) => this.applyMovement(i, j, false));
    this.manual.onMove((di, dj) => this.applyMovement(di, dj, true));
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
    saveGameState();
  }

  setMode(mode: "gps" | "manual") {
    this.active.stop();
    this.active = mode === "gps" ? this.gps : this.manual;
    this.currentMode = mode;
    this.active.start();
  }

  getMode() {
    return this.currentMode;
  }
}

const movementFacade = new PlayerMovementFacade(dPad);

// Update movement toggle button text
function updateMovementToggleText() {
  if (movementFacade.getMode() === "gps") {
    movementToggleBtn.textContent = "Switch to Manual Movement";
  } else {
    movementToggleBtn.textContent = "Switch to GPS Movement";
  }
}

movementToggleBtn.addEventListener("click", () => {
  if (gamePaused) return;

  if (movementFacade.getMode() === "gps") {
    movementFacade.setMode("manual");
  } else {
    movementFacade.setMode("gps");
  }
  updateMovementToggleText();
});

function updateDpadVisibility() {
  if (movementFacade.getMode() === "manual") {
    dPad.style.display = "grid";
  } else {
    dPad.style.display = "none";
  }
}

// ================================
//           GPS FUNCTIONS
// ================================
function requestGPS() {
  if (!navigator.geolocation) {
    console.warn("Geolocation not available. Switching to manual mode.");
    movementFacade.setMode("manual");
    loadingOverlay.remove();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const p = latLngToGrid(
        leaflet.latLng(pos.coords.latitude, pos.coords.longitude),
      );
      playerI = p.i;
      playerJ = p.j;
      playerLatLng = leaflet.latLng(pos.coords.latitude, pos.coords.longitude);

      updatePlayerMarker();
      updateVisibleCells();
      refreshCellInteractivity();
      updateStatus();
      loadingOverlay.remove();
      map.setView(playerLatLng, SETTINGS.GAMEPLAY_ZOOM_LEVEL);
    },
    () => {
      loadingMessage.textContent = "Unable to get location. Please enable GPS.";
      retryBtn.style.display = "inline-block";
      movementFacade.setMode("manual");
      updateMovementToggleText();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
  );
}

retryBtn.addEventListener("click", () => {
  loadingMessage.textContent = "Retrying…";
  retryBtn.style.display = "none";
  requestGPS();
});

// ================================
//         HELPER FUNCTIONS
// ================================
function updatePlayerMarker() {
  playerLatLng = gridToLatLng(playerI, playerJ);
  playerMarker.setLatLng(playerLatLng);
}

centerBtn.addEventListener("click", () => {
  if (gamePaused) return;

  map.setView(playerLatLng, SETTINGS.GAMEPLAY_ZOOM_LEVEL, {
    animate: true,
    duration: 0.4,
  });
});

// ================================
//       SAVE / LOAD GAME STATE
// ================================
interface SaveData {
  playerI: number;
  playerJ: number;
  playerValue: number;
  winScore: number;
  movementMode: "gps" | "manual";
  modifiedCells: { [key: string]: { i: number; j: number; value: number } };
}

function saveGameState() {
  const data: SaveData = {
    playerI,
    playerJ,
    playerValue,
    winScore,
    movementMode: movementFacade.getMode(),
    modifiedCells: Object.fromEntries(
      Array.from(modifiedCells.entries()).map((
        [k, c],
      ) => [k, { i: c.i, j: c.j, value: c.value }]),
    ),
  };
  localStorage.setItem("myGameSave", JSON.stringify(data));
}

function loadGameState() {
  const saved = localStorage.getItem("myGameSave");
  if (!saved) return;
  try {
    const data: SaveData = JSON.parse(saved);
    playerI = data.playerI;
    playerJ = data.playerJ;
    playerValue = data.playerValue;
    winScore = data.winScore;
    movementFacade.setMode(data.movementMode);
    updateMovementToggleText();
    updateDpadVisibility();

    // Fix win score if empty
    if (winScore == null) {
      winScore = 64;
    }

    modifiedCells.clear();
    for (const k in data.modifiedCells) {
      modifiedCells.set(k, { ...data.modifiedCells[k] });
    }

    updatePlayerMarker();
    updateVisibleCells();
    refreshCellInteractivity();
    updateStatus();
  } catch (e) {
    console.warn("Failed to load game state:", e);
  }
}

// ================================
//            RESET BUTTON
// ================================
resetBtn.addEventListener("click", () => {
  if (gamePaused) return;

  if (
    !confirm(
      "Are you sure you want to reset the game? This will erase all progress.",
    )
  ) return;
  localStorage.removeItem("myGameSave");
  location.reload();
});

// ================================
//          INITIALIZE GAME
// ================================
movementFacade.setMode("gps"); // Default mode
loadGameState();
updateVisibleCells();
updateStatus();
requestGPS();
