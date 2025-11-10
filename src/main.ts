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
const TILE_SIZE = 1e-4;   // In reference to world lat and lng
const VIEW_SIZE_X = 26;
const VIEW_SIZE_Y = 9;
const CELL_SPAWN_PROBABILITY = 1;

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

// Function to place a cell on the map
function spawnCell(i: number, j: number) {
  // Convert cell numbers into lat/lng bounds
  const origin = STARTING_LATLNG;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_SIZE, origin.lng + j * TILE_SIZE],
    [origin.lat + (i + 1) * TILE_SIZE, origin.lng + (j + 1) * TILE_SIZE],
  ]);

  // Add a rectangle to the map to represent the cell
  const cell = leaflet.rectangle(bounds);
  cell.addTo(map);

  // Add popup on clicking a cell
  cell.bindPopup(() => {
    // Each cache has a random point value, mutable by the player
    let cellValue = Math.floor(luck([i, j, "initialValue"].toString()) * 100);

    // The popup offers a description and button
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>Cell location: "${i},${j}". Value: <span id="value">${cellValue}</span>.</div>
      <button id="take">Take</button>
      <button id="place">Place</button>`;

    // Clicking take button puts token in player inventory and removes cell
    popupDiv
      .querySelector<HTMLButtonElement>("#take")!
      .addEventListener("click", () => {
        playerValue = cellValue;
        statusPanelDiv.innerHTML = `Current token value: ${playerValue}`;

        // Empty cell
        cellValue = 0
      });
    
    // Clicking place button replaces cell token if different or merges with it if they match
    popupDiv
      .querySelector<HTMLButtonElement>("#place")!
      .addEventListener("click", () => {
        if (cellValue == playerValue) {
          cellValue *= 2;
        } else {
          cellValue = playerValue;
        }

        playerValue = 0;
      });

    return popupDiv;
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

function UpdateCell() {

}
