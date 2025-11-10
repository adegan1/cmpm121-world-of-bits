# D3: World of Bits

## Game Design Vision

In this game, players move around the game by traversing the real world (similarly to Pokemon Go, Pikmin Bloom, or how Minecraft World was). The world that the player is in is composed of a grid containing cells that the player can view, each holding a certain number of "tokens." As the player gets near a cell, they are able to interact with them and collect the tokens, or if the player is already holding a token, they may conbine it with the cell to create a new token of doubled value. This cycle continues until the player reaches a specified goal.

## Technologies

- TypeScript for most game code, little to no explicit HTML, and all CSS collected in common `style.css` file
- Deno and Vite for building
- GitHub Actions + GitHub Pages for deployment automation

## Assignments

## D3.a: Core mechanics (token collection and crafting)

Key technical challenge: Can you assemble a map-based user interface using the Leaflet mapping framework?
Key gameplay challenge: Can players collect and craft tokens from nearby locations to finally make one of sufficiently high value?

### Steps

- [x] come to understand the main.ts starter code
- [x] copy main.ts to reference.ts for future reference
- [x] delete everything in main.ts
- [x] put a basic leaflet map on the screen
- [x] draw the player's location on the map
- [x] draw a rectangle representing one cell on the map
- [x] use loops to draw a whole grid of cells on the map
- [x] add a popup when the player clicks on a cell
- [x] give each cell a random value
- [ ] make cell spawns randomized (based on luck value)
- [x] allow player to take a cell's token when interacting (one held at a time) (remove cell's token)
- [ ] give player option to place held token on a cell (merging if they are the same size)
- [ ] only allow players to interact with cells that are near them
- [ ] make initial state of cells consistent across page loads
- [ ] create an inventory slot that shows the currently picked up token
- [ ] add an ending if the player reaches a certain token value
