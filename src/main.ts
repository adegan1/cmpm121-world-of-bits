// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// ---------- Style sheets and other imports ----------
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // css script

// Fix missing marker images
import "./_leafletWorkaround.ts"; // fixes for missing Leaflet images

// Import our luck function
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

// ---------- Coordinate System Abstraction ----------
interface Point {
  i: number;
  j: number;
}

const renderedCells = new Map<string, Cell>(); // Visible, rendered cells
const modifiedCells = new Map<string, Cell>(); // Permanently stored, modified cells

// Get lat and lng using grid space
function gridToLatLng(i: number, j: number): L.LatLng {
  return leaflet.latLng(
    SETTINGS.ORIGIN_LATLNG.lat + j * SETTINGS.TILE_SIZE, // Vertical (north/south)
    SETTINGS.ORIGIN_LATLNG.lng + i * SETTINGS.TILE_SIZE, // Horizontal (east/west)
  );
}

// Get grid space using lat and lng
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

// ---------- Tunable gameplay settings ----------
const SETTINGS = {
  ORIGIN_LATLNG: leaflet.latLng(0, 0), // Null Island
  TILE_SIZE: 1e-4,
  INTERACT_DISTANCE: 3,
  CELL_SPAWN_PROBABILITY: 0.1,
  GAMEPLAY_ZOOM_LEVEL: 19,
  WIN_SCORE: 64,
  IN_RANGE_OPACITY: .8,
  OUT_OF_RANGE_OPACITY: .3,
};

// ---------- Player variables ----------
let playerValue = 0;
let playerWon = false;

let playerI = 0; // East-west (affects lng)
let playerJ = 0; // North-south (affects lat)
let playerLatLng = gridToLatLng(playerI, playerJ);

// ---------- Map creation ----------
const map = leaflet.map(mapDiv, {
  center: SETTINGS.ORIGIN_LATLNG,
  zoom: SETTINGS.GAMEPLAY_ZOOM_LEVEL,
  minZoom: SETTINGS.GAMEPLAY_ZOOM_LEVEL,
  maxZoom: SETTINGS.GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Add map visuals (from openstreetmap.org)
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(SETTINGS.ORIGIN_LATLNG);
playerMarker.bindTooltip("You");
playerMarker.addTo(map);

// Update cells when finished moving map
map.on("moveend", updateVisibleCells);

// ---------- Cell Functionality ----------
interface Cell {
  i: number;
  j: number;
  value: number;
  element?: leaflet.Rectangle;
  popup?: HTMLDivElement;
}

class CellFactory {
  static create(i: number, j: number): Cell {
    // Check if already modified
    const key = `${i},${j}`;
    if (modifiedCells.has(key)) {
      return modifiedCells.get(key)!;
    }

    // Otherwise create a "flyweight" temporary cell using luck()
    const randomFloat = luck(`${i}:${j}:initialValue`);
    const value = randomFloat < 0.75 ? 2 : 4;

    return { i, j, value, element: null as unknown as leaflet.Rectangle };
  }

  static modify(cell: Cell) {
    const key = `${cell.i},${cell.j}`;
    modifiedCells.set(key, cell);
  }

  static isModified(i: number, j: number): boolean {
    return modifiedCells.has(`${i},${j}`);
  }
}

// ---------- Popup Management ----------
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
  // Take
  popupDiv.querySelector("#take")!.addEventListener("click", () => {
    if (withinRange(cell.i, cell.j)) {
      // Swap token values
      if (playerValue === 0 && cell.value === 0) return; // Skip action
      const temp = playerValue;
      playerValue = cell.value;
      cell.value = temp;

      // Persist this cell as modified
      CellFactory.modify(cell);

      // Check if player has won
      if (playerValue == SETTINGS.WIN_SCORE) {
        playerWon = true;
      }

      // Update popup UI
      const valueSpan = popupDiv.querySelector("#value")!;
      valueSpan.textContent = cell.value.toString();

      updateCellAppearance(cell);
      updateStatus();
    }
  });

  // Place
  popupDiv.querySelector("#place")!.addEventListener("click", () => {
    if (withinRange(cell.i, cell.j)) {
      if (playerValue > 0) {
        // Replace or merge the cell value
        cell.value = cell.value === playerValue ? cell.value * 2 : playerValue;

        // Persist this modified cell in memory
        CellFactory.modify(cell);

        // Update visuals and player status
        updateCellAppearance(cell);
        playerValue = 0;
        updateStatus();

        // Update popup UI
        const valueSpan = popupDiv.querySelector("#value")!;
        valueSpan.textContent = cell.value.toString();
      }
    }
  });
}

// ---------- Cell Management ----------
// Update the cells within the player's view
function updateVisibleCells() {
  const cellRectBounds = map.getBounds();
  const min = latLngToGrid(cellRectBounds.getSouthWest());
  const max = latLngToGrid(cellRectBounds.getNorthEast());

  const margin = 1;
  const visibleNow = new Set<string>(); // track which cells *should* be visible

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

      // Skip cells that shouldn't spawn (probability)
      if (luck([i, j].toString()) >= SETTINGS.CELL_SPAWN_PROBABILITY) continue;

      // If it's already rendered, skip creation
      if (renderedCells.has(key)) continue;

      // Otherwise, get the cell (either modified or new flyweight)
      const cell = CellFactory.create(i, j);

      // Create rectangle
      const rectBounds = cellBounds(i, j);
      const element = leaflet.rectangle(rectBounds, {
        color: valueToColor(cell.value),
        weight: 1,
        fillOpacity: withinRange(i, j)
          ? SETTINGS.IN_RANGE_OPACITY
          : SETTINGS.OUT_OF_RANGE_OPACITY,
      }).addTo(map);

      cell.element = element;

      // Only create popup once
      if (withinRange(i, j)) {
        if (!cell.popup) {
          cell.popup = createPopupContent(cell);
        }
        element.bindPopup(cell.popup);
      } else {
        element.bindTooltip("Too far away!", { permanent: false });
      }

      // Track that this cell is now rendered
      renderedCells.set(key, cell);
    }
  }

  // Remove cells that went offscreen
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
      if (!cell.popup) {
        cell.popup = createPopupContent(cell);
      }
      cell.element?.bindPopup(cell.popup);
    } else {
      cell.element?.bindTooltip("Too far away!", { permanent: false });
    }
  }
}

// Check if player is within interaction distance
function withinRange(i: number, j: number): boolean {
  return (
    i <= playerI + SETTINGS.INTERACT_DISTANCE &&
    i >= playerI - SETTINGS.INTERACT_DISTANCE &&
    j <= playerJ + SETTINGS.INTERACT_DISTANCE &&
    j >= playerJ - SETTINGS.INTERACT_DISTANCE
  );
}

// Change cell color depending on value
function valueToColor(value: number): string {
  // Base hue from value
  const hue = (Math.log2(value) * 45) % 360;
  const lightness = 70 - Math.min(Math.log2(value), 6) * 5;
  return `hsl(${hue}, 100%, ${lightness}%)`;
}

// ---------- Update status elements ----------
// Update cell appearance on interact
function updateCellAppearance(cell: Cell): void {
  cell.element?.setStyle({
    color: valueToColor(cell.value),
    fillOpacity: withinRange(cell.i, cell.j)
      ? SETTINGS.IN_RANGE_OPACITY
      : SETTINGS.OUT_OF_RANGE_OPACITY,
  });
}

// Update player status
function updateStatus(): void {
  if (!playerWon) {
    statusPanelDiv.innerHTML =
      `Current token value: ${playerValue} <br><br> Win if holding: ${SETTINGS.WIN_SCORE}`;
  } else {
    statusPanelDiv.innerHTML = `Congrats! You won!`;
  }
}

// Update player marker position when coords change
function updatePlayerMarker() {
  playerLatLng = gridToLatLng(playerI, playerJ);
  playerMarker.setLatLng(playerLatLng);
}

// ---------- Player movement ----------
// Play movement through geolocation
function syncPlayerToGeolocation() {
  if (!navigator.geolocation) {
    console.warn("Geolocation not supported.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;

      // Convert real-world lat/lng to grid coordinates
      const p = latLngToGrid(leaflet.latLng(latitude, longitude));

      playerI = p.i;
      playerJ = p.j;

      updatePlayerMarker();
      updateVisibleCells();
      refreshCellInteractivity();
      updateStatus();

      console.log(`Synced player to grid: (${playerI}, ${playerJ})`);
    },
    (err) => {
      console.warn("Geolocation error:", err);
    },
    { enableHighAccuracy: true },
  );
}

// Player movement through buttons
const directions = {
  up: [0, 1], // +Lat → north
  right: [1, 0], // +Lng → east
  down: [0, -1], // -Lat → south
  left: [-1, 0], // -Lng → west
};

// Set up D-pad buttons
Object.entries(directions).forEach(([dir, [dx, dy]]) => {
  dPad.querySelector(`.${dir}`)?.addEventListener("click", () => {
    playerI += dx;
    playerJ += dy;
    updatePlayerMarker();
    updateVisibleCells();
    refreshCellInteractivity();
    updateStatus();
  });
});

// Center map on player location
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

// ---------- Initial calls ----------
updateVisibleCells();
updateStatus();
syncPlayerToGeolocation();
centerView(true, 0.1);

// Sync player location every 3 seconds
setInterval(syncPlayerToGeolocation, 3000);
