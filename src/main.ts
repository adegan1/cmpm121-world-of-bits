// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // css script

// Fix missing marker images
import "./_leafletWorkaround.ts"; // fixes for missing Leaflet images

// Import our luck function
//import luck from "./_luck.ts";

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
//const TILE_SIZE = 1e-4;   // In reference to world lat and lng
//const NEIGHBORHOOD_SIZE = 8;
//const CACHE_SPAWN_PROBABILITY = .1;

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
leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
})
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(STARTING_LATLNG);
playerMarker.bindTooltip("You");
playerMarker.addTo(map);
