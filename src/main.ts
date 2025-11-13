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

const cells: { i: number; j: number; value: number; element: L.Rectangle }[] =
  []; // Store all active cells

// Map grid coordinates to real-world position
const ORIGIN_LATLNG = leaflet.latLng(0, 0); // Null Island
const TILE_SIZE = 1e-4; // In reference to world lat and lng

// Get lat and lng using grid space
function gridToLatLng(x: number, y: number): L.LatLng {
  return leaflet.latLng(
    ORIGIN_LATLNG.lat + x * TILE_SIZE,
    ORIGIN_LATLNG.lng + y * TILE_SIZE,
  );
}

// Get grid space using lat and lng
function latLngToGrid(latlng: L.LatLng): Point {
  return {
    i: Math.floor((latlng.lat - ORIGIN_LATLNG.lat) / TILE_SIZE),
    j: Math.floor((latlng.lng - ORIGIN_LATLNG.lng) / TILE_SIZE),
  };
}

function cellBounds(x: number, y: number): L.LatLngBounds {
  return leaflet.latLngBounds(gridToLatLng(x, y), gridToLatLng(x + 1, y + 1));
}

// ---------- Tunable gameplay parameters ----------
const GAMEPLAY_ZOOM_LEVEL = 19;
const CELL_SPAWN_PROBABILITY = .1;
const INTERACT_DISTANCE = 3;
const WIN_SCORE = 64;

// ---------- Player variables ----------
let playerValue = 0;
let playerWon = false;

let playerX = 0;
let playerY = 0;
let playerLatLng = leaflet.latLng(playerX, playerY);

// ---------- Map creation ----------
const map = leaflet.map(mapDiv, {
  center: ORIGIN_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
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
const playerMarker = leaflet.marker(ORIGIN_LATLNG);
playerMarker.bindTooltip("You");
playerMarker.addTo(map);

// Update cells when finished moving map
map.on("moveend", updateVisibleCells);

// ---------- Cell Functionality ----------
interface Cell {
  i: number;
  j: number;
  value: number;
  element: L.Rectangle;
}

function spawnCell(i: number, j: number): Cell {
  // Use luck() to get a deterministic 0–1 float
  const randomFloat = luck(`${i}:${j}:initialValue`);

  // 75% chance for 2, 25% for 4
  const value = randomFloat < 0.75 ? 2 : 4;

  // Set bounds
  const bounds = cellBounds(i, j); // instead of manual array math

  // Create a rectangle to represent a cell
  const element = leaflet.rectangle(bounds, {
    color: valueToColor(value),
    weight: 1,
    fillOpacity: 0.6,
  }).addTo(map);

  // Create popup content
  const popupDiv = document.createElement("div");
  popupDiv.innerHTML = `
    <div>Cell: ${i}, ${j}. Value: <span id="value">${value}</span></div>
    <button id="take">Take</button>
    <button id="place">Place</button>
  `;

  const cell: Cell = { i, j, value, element };
  cells.push(cell);
  return cell;
}

function managePopup(cell: Cell, popupDiv: HTMLDivElement) {
  // Store references to elements we want to update
  const valueSpan = popupDiv.querySelector("#value")!;

  // Take
  popupDiv.querySelector("#take")!.addEventListener("click", () => {
    if (withinRange(cell.i, cell.j)) {
      if (cell.value > 0) {
        const temp = playerValue;
        playerValue = cell.value;
        cell.value = temp;

        // Check if player met win requirement
        if (playerValue == WIN_SCORE) {
          playerWon = true;
        }

        updateCellAppearance(cell);
        updateStatus();

        // Update UI
        valueSpan.textContent = cell.value.toString();
      }
    }
  });

  // Place
  popupDiv.querySelector("#place")!.addEventListener("click", () => {
    if (withinRange(cell.i, cell.j)) {
      if (playerValue > 0) {
        // Replace cell token if different or merge if values match
        cell.value = cell.value === playerValue ? cell.value * 2 : playerValue;
        updateCellAppearance(cell);
        playerValue = 0;
        updateStatus();

        // Update UI
        valueSpan.textContent = cell.value.toString();
      }
    }
  });
}

// ---------- Cell Maintenance ----------
// Update each cell
function updateAllCells(): void {
  cells.forEach((cell) => {
    updateCellAppearance(cell);

    // Update popups / tooltips
    if (withinRange(cell.i, cell.j)) {
      const popupDiv = document.createElement("div");
      popupDiv.innerHTML = `
        <div>Cell: ${cell.i}, ${cell.j}. Value: <span id="value">${cell.value}</span></div>
        <button id="take">Take</button>
        <button id="place">Place</button>
      `;

      managePopup(cell, popupDiv);

      cell.element.unbindTooltip(); // ensure no tooltip
      cell.element.bindPopup(popupDiv);
    } else {
      cell.element.unbindPopup(); // ensure no popup
      cell.element.bindTooltip("Too far away!", { permanent: false });
    }
  });
}

// Update the cells within the player's view
function updateVisibleCells() {
  // Get current map bounds (LatLngBounds)
  const bounds = map.getBounds();

  // Convert bounds corners to grid coordinates
  const min = latLngToGrid(bounds.getSouthWest());
  const max = latLngToGrid(bounds.getNorthEast());

  // Define inclusive range (with buffer for smooth edges)
  const margin = 1;
  const minI = Math.floor(min.i) - margin;
  const maxI = Math.ceil(max.i) + margin;
  const minJ = Math.floor(min.j) - margin;
  const maxJ = Math.ceil(max.j) + margin;

  // Remove offscreen cells
  for (let idx = cells.length - 1; idx >= 0; idx--) {
    const cell = cells[idx];
    if (cell.i < minI || cell.i > maxI || cell.j < minJ || cell.j > maxJ) {
      cell.element.removeFrom(map);
      cells.splice(idx, 1);
    }
  }

  // Spawn new cells in visible area (if not already present)
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      if (!cells.some((cell) => cell.i === i && cell.j === j)) {
        // Use luck() to determine whether to spawn
        if (luck([i, j].toString()) < CELL_SPAWN_PROBABILITY) {
          spawnCell(i, j);
        }
      }
    }
  }

  updateAllCells();
}

// Check if player is within interaction distance
function withinRange(i: number, j: number): boolean {
  if (
    i <= playerX + INTERACT_DISTANCE &&
    i >= playerX - INTERACT_DISTANCE &&
    j <= playerY + INTERACT_DISTANCE &&
    j >= playerY - INTERACT_DISTANCE
  ) {
    return true;
  } else {
    return false;
  }
}

// Change cell color depending on value
function valueToColor(value: number): string {
  // Base hue from value — cycles through rainbow every 12 "doublings"
  const hue = (Math.log2(value) * 45) % 360; // 45° per power of 2

  return `hsl(${hue}, 100%, 60%)`;
}

// ---------- Update status elements ----------
// Update cell appearance on interact
function updateCellAppearance(cell: Cell): void {
  cell.element.setStyle({
    color: valueToColor(cell.value),
    fillOpacity: withinRange(cell.i, cell.j) ? 0.6 : 0.2,
  });
}

// Update player status
function updateStatus(): void {
  if (!playerWon) {
    statusPanelDiv.innerHTML =
      `Current token value: ${playerValue} <br><br> Win if holding: ${WIN_SCORE}`;
  } else {
    statusPanelDiv.innerHTML = `Congrats! You won!`;
  }
}

// Update player marker position when coords change
function updatePlayerMarker() {
  playerLatLng = gridToLatLng(playerX, playerY);
  playerMarker.setLatLng(playerLatLng);
}

// ---------- Player movement ----------
// Direction mappings: class name → [dx, dy]
const directions = {
  up: [1, 0],
  right: [0, 1],
  down: [-1, 0],
  left: [0, -1],
};

// Set up D-pad buttons
Object.entries(directions).forEach(([dir, [dx, dy]]) => {
  dPad.querySelector(`.${dir}`)?.addEventListener("click", () => {
    playerX += dx;
    playerY += dy;
    updatePlayerMarker();
    updateAllCells();
    updateStatus();
  });
});

// ---------- Initial calls ----------
updateAllCells();
updateVisibleCells();
updateStatus();
