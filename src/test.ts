// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Fix missing marker images
import "./_leafletWorkaround.ts";

// Import styles
import "leaflet/dist/leaflet.css";
import "./style.css";

// Import luck for deterministic randomness
import luck from "./_luck.ts";

// -- UI Elements --
const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.appendChild(controlPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.appendChild(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.appendChild(statusPanelDiv);

const dPad = document.createElement("div");
dPad.className = "d-pad";
dPad.innerHTML = `
  <button class="up">↑</button>
  <button class="left">←</button>
  <button class="right">→</button>
  <button class="down">↓</button>
`;
document.body.appendChild(dPad);

// -- Coordinate System Abstraction --
interface Point {
  i: number;
  j: number;
}

const ORIGIN_LATLNG = leaflet.latLng(0, 0);
const TILE_SIZE = 1e-4;

function gridToLatLng(i: number, j: number): L.LatLng {
  return leaflet.latLng(
    ORIGIN_LATLNG.lat + i * TILE_SIZE,
    ORIGIN_LATLNG.lng + j * TILE_SIZE,
  );
}

function latLngToGrid(latlng: L.LatLng): Point {
  return {
    i: Math.floor((latlng.lat - ORIGIN_LATLNG.lat) / TILE_SIZE),
    j: Math.floor((latlng.lng - ORIGIN_LATLNG.lng) / TILE_SIZE),
  };
}

function cellBounds(i: number, j: number): L.LatLngBounds {
  const corner1 = gridToLatLng(i, j);
  const corner2 = gridToLatLng(i + 1, j + 1);
  return leaflet.latLngBounds(corner1, corner2);
}

// -- Gameplay Parameters --
const GAMEPLAY_ZOOM_LEVEL = 19;
const INTERACT_DISTANCE = 3;
const WIN_SCORE = 64;

// -- Player State --
let playerValue = 0;
let playerWon = false;
let playerX = 0;
let playerY = 0;
let playerLatlng = gridToLatLng(playerX, playerY);

// -- Cell System --
interface Cell {
  i: number;
  j: number;
  value: number;
  element: L.Rectangle;
}

// Memento care-taker: only modified cells are stored
const modifiedCells = new Map<string, Cell>();

// Flyweight: compute default value for unclaimed cells
function getDefaultCellValue(i: number, j: number): number {
  const random = luck(`cell:${i},${j}`);
  return random < 0.75 ? 2 : 4;
}

function valueToColor(value: number): string {
  const hue = (Math.log2(value) * 45) % 360;
  return `hsl(${hue}, 100%, 60%)`;
}

// -- Cell Appearance & Management --
function updateCellAppearance(cell: Cell): void {
  cell.element.setStyle({
    color: valueToColor(cell.value),
    fillOpacity: withinRange(cell.i, cell.j) ? 0.6 : 0.2,
  });
}

function bindCellPopup(cell: Cell): void {
  const popupDiv = document.createElement("div");
  popupDiv.innerHTML = `
    <div>
      <div>Cell: ${cell.i}, ${cell.j}. Value: <span id="value">${cell.value}</span></div>
      <button id="take">Take</button>
      <button id="place">Place</button>
    </div>
  `;

  const valueSpan = popupDiv.querySelector("#value")!;
  const takeBtn = popupDiv.querySelector("#take")! as HTMLButtonElement;
  const placeBtn = popupDiv.querySelector("#place")! as HTMLButtonElement;

  takeBtn.addEventListener("click", () => {
    if (withinRange(cell.i, cell.j) && cell.value > 0) {
      const temp = playerValue;
      playerValue = cell.value;
      cell.value = temp;

      updateCellAppearance(cell);
      updateStatus();
      valueSpan.textContent = cell.value.toString();

      if (playerValue === WIN_SCORE) {
        playerWon = true;
        updateStatus();
      }

      cell.element.bindPopup(popupDiv); // refresh
    }
  });

  placeBtn.addEventListener("click", () => {
    if (withinRange(cell.i, cell.j) && playerValue > 0) {
      const key = `${cell.i},${cell.j}`;
      if (!modifiedCells.has(key)) {
        materializeCell(cell.i, cell.j);
      }

      const storedCell = modifiedCells.get(key)!;
      storedCell.value = storedCell.value === playerValue
        ? storedCell.value * 2
        : playerValue;

      playerValue = 0;
      updateCellAppearance(storedCell);
      updateStatus();
      valueSpan.textContent = storedCell.value.toString();

      if (storedCell.value === WIN_SCORE) {
        playerWon = true;
        updateStatus();
      }

      cell.element.bindPopup(popupDiv); // refresh
    }
  });

  cell.element.bindPopup(popupDiv);
}

function materializeCell(i: number, j: number): Cell {
  const key = `${i},${j}`;
  if (modifiedCells.has(key)) return modifiedCells.get(key)!;

  const value = getDefaultCellValue(i, j);
  const bounds = cellBounds(i, j);
  const element = leaflet.rectangle(bounds, {
    color: valueToColor(value),
    weight: 1,
    fillOpacity: 0.6,
  });

  const cell: Cell = { i, j, value, element };
  modifiedCells.set(key, cell);
  bindCellPopup(cell);

  return cell;
}

// -- Map Initialization --
const map = leaflet.map(mapDiv, {
  center: ORIGIN_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Player marker
const playerMarker = leaflet.marker(ORIGIN_LATLNG).bindTooltip("You");
playerMarker.addTo(map);

// -- Update Logic --
function withinRange(i: number, j: number): boolean {
  return (
    i <= playerX + INTERACT_DISTANCE &&
    i >= playerX - INTERACT_DISTANCE &&
    j <= playerY + INTERACT_DISTANCE &&
    j >= playerY - INTERACT_DISTANCE
  );
}

function updateVisibleCells(): void {
  const bounds = map.getBounds();
  const min = latLngToGrid(
    leaflet.latLng(bounds.getSouthWest().lat, bounds.getSouthWest().lng),
  );
  const max = latLngToGrid(
    leaflet.latLng(bounds.getNorthEast().lat, bounds.getNorthEast().lng),
  );

  // Round out a bit to ensure coverage
  const minI = Math.floor(min.i) - 1;
  const maxI = Math.ceil(max.i) + 1;
  const minJ = Math.floor(min.j) - 1;
  const maxJ = Math.ceil(max.j) + 1;

  // Remove offscreen cells
  for (const cell of modifiedCells.values()) {
    if (cell.i < minI || cell.i > maxI || cell.j < minJ || cell.j > maxJ) {
      cell.element.removeFrom(map);
    }
  }

  // Render visible cells
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      const key = `${i},${j}`;
      let cell = modifiedCells.get(key);

      if (!cell) {
        cell = materializeCell(i, j);
      } else if (!map.hasLayer(cell.element)) {
        cell.element.addTo(map);
      }
    }
  }
}

function updateStatus(): void {
  if (!playerWon) {
    statusPanelDiv.innerHTML =
      `Current token value: ${playerValue}<br><br>Win if holding: ${WIN_SCORE}`;
  } else {
    statusPanelDiv.innerHTML = "🎉 Congratulations! You won!";
  }
}

function updatePlayerMarker(): void {
  playerLatlng = gridToLatLng(playerX, playerY);
  playerMarker.setLatLng(playerLatlng);
}

// -- Input (D-Pad) --
const directions: Record<string, [number, number]> = {
  up: [1, 0],
  right: [0, 1],
  down: [-1, 0],
  left: [0, -1],
};

Object.entries(directions).forEach(([dir, [dx, dy]]) => {
  const button = dPad.querySelector(`.${dir}`);
  if (button) {
    button.addEventListener("click", () => {
      playerX += dx;
      playerY += dy;
      updatePlayerMarker();
      updateVisibleCells();
      updateStatus();
    });
  }
});

// -- Initial Call --
updateVisibleCells();
updateStatus();
