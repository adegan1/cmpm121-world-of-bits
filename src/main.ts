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

// Player variables
let playerValue = 0;

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
  const origin = STARTING_LATLNG;
  const value = Math.floor(luck(seedToString([i, j, "initialValue"])) * 100);
  const bounds = leaflet.latLngBounds(
    [origin.lat + i * TILE_SIZE, origin.lng + j * TILE_SIZE],
    [origin.lat + (i + 1) * TILE_SIZE, origin.lng + (j + 1) * TILE_SIZE],
  );

  const element = leaflet.rectangle(bounds, {
    color: "#ffc40056",
    weight: 1,
    fillOpacity: 0.6,
  }).addTo(map);

  // Interactivity!
  element.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>Cell: ${i}, ${j}. Value: <span id="value">${value}</span></div>
      <button id="take">Take</button>
      <button id="place">Place</button>
    `;

    popupDiv.querySelector("#take")!.addEventListener("click", () => {
      playerValue += takeCell(cell);
      updateStatus();
    });

    popupDiv.querySelector("#place")!.addEventListener("click", () => {
      placeCell(cell);
      updateStatus();
    });

    return popupDiv;
  });

  const cell: Cell = { i, j, value, element };
  cells.push(cell);
  return cell;
}

// Take token from cell
function takeCell(cell: Cell): number {
  const earned = cell.value;
  cell.value = 0;
  cell.element.setStyle({ fillOpacity: 0.1, color: "#888" });
  return earned;
}

// Place token on cell
function placeCell(cell: Cell): void {
  if (playerValue === 0) return;
  if (cell.value === playerValue) {
    cell.value *= 2;
  } else {
    cell.value = playerValue;
  }
  cell.element.setStyle({ fillOpacity: 0.6, color: "#ff9900" });
  playerValue = 0;
}

// Update each cell
/*function updateAllCells(): void {
  cells.forEach((cell) => {
    cell.element.setStyle({
      fillOpacity: cell.value > 0 ? 0.6 : 0.1,
    });
  });
}*/

// Add cells within the player's view
for (let i = -VIEW_SIZE_Y; i < VIEW_SIZE_Y; i++) {
  for (let j = -VIEW_SIZE_X; j < VIEW_SIZE_X; j++) {
    // Spawn a cell if luck meets requirement
    if (luck([i, j].toString()) < CELL_SPAWN_PROBABILITY) {
      spawnCell(i, j);
    }
  }
}

// Update player status
function updateStatus(): void {
  statusPanelDiv.innerHTML = `Current token value: ${playerValue}`;
}
updateStatus();

// Change an array into a repeatable string key
function seedToString(seed: (string | number)[]): string {
  return seed.map((part) => part.toString()).join(":");
}
