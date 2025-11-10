// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // css script

// Fix missing marker images
import "./_leafletWorkaround.ts"; // fixes for missing Leaflet images

// Import our luck function
import luck from "./_luck.ts";

// Create basic UI elements
const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

// KU dorm location (starting pos)
const STARTING_LATLNG = leaflet.latLng(
  35.05097,
  135.79187,
);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_SIZE = 1e-4; // In reference to world lat and lng
const VIEW_SIZE_X = 26;
const VIEW_SIZE_Y = 9;
const CELL_SPAWN_PROBABILITY = .1;
const INTERACT_DISTANCE = 6;
const WIN_SCORE = 32;

// Player variables
let playerValue = 0;
let playerWon = false;

const playerX = 0;
const playerY = 0;

// Create the map
const map = leaflet.map(mapDiv, {
  center: STARTING_LATLNG,
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
const playerMarker = leaflet.marker(STARTING_LATLNG);
playerMarker.bindTooltip("You");
playerMarker.addTo(map);

// main.ts
interface Cell {
  i: number;
  j: number;
  value: number;
  element: L.Rectangle;
}

const cells: Cell[] = []; // Store all active cells

function spawnCell(i: number, j: number): Cell {
  // Use luck() to get a deterministic 0–1 float
  const randomFloat = luck(`${i}:${j}:initialValue`);

  // 75% chance for 2, 25% for 4
  const value = randomFloat < 0.75 ? 2 : 4;

  // Set origin and bounds
  const origin = STARTING_LATLNG;
  const bounds = leaflet.latLngBounds(
    [origin.lat + i * TILE_SIZE, origin.lng + j * TILE_SIZE],
    [origin.lat + (i + 1) * TILE_SIZE, origin.lng + (j + 1) * TILE_SIZE],
  );

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

  if (withinRange(i, j)) {
    element.bindPopup(popupDiv);
  } else {
    element.unbindPopup(); // ensure no popup
    element.bindTooltip("Too far away!", { permanent: false });
  }

  const cell: Cell = { i, j, value, element };
  cells.push(cell);
  return cell;
}

// Update each cell
function updateAllCells(): void {
  cells.forEach((cell) => {
    updateCellAppearance(cell);
  });
}

// Add cells within the player's view
for (let i = -VIEW_SIZE_Y; i < VIEW_SIZE_Y; i++) {
  for (let j = -VIEW_SIZE_X; j < VIEW_SIZE_X; j++) {
    // Spawn a cell if luck meets requirement
    if (luck([i, j].toString()) < CELL_SPAWN_PROBABILITY) {
      spawnCell(i, j);
    }
  }
}

// Check if player is within interaction distance
function withinRange(i: number, j: number): boolean {
  if (
    Math.abs(i) <= playerX + INTERACT_DISTANCE &&
    Math.abs(j) <= playerY + INTERACT_DISTANCE
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

// Initial calls
updateAllCells();
updateStatus();
