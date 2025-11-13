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
- [x] make cell spawns randomized (based on luck value)
- [x] allow player to take a cell's token when interacting (one held at a time) (remove cell's token)
- [x] give player option to place held token on a cell (merging if they are the same size)
- [x] only allow players to interact with cells that are near them
- [x] make initial state of cells consistent across page loads
- [x] make player status show current token
- [x] add an goal if the player reaches a certain token value

## D3.b: Globe-spanning gameplay (player movement and exploration)

Key technical challenge: Can you create a world-spanning grid of tiles while only keeping memory of what is relevant?
Key gameplay challenge: Can players walk around the world to simulate real-world traversal?

### Steps

- [x] abstract coordinates system
- [x] add four player movment buttons for up, down, left, and right
- [x] allow the player to move one tile at a time in any of the four cardinal directions
- [x] spawn in new cells and remove old ones to fit player view (using moveend function)
- [x] update interactable cells (must be near player)
- [x] have cells appear memoryless in current version
- [x] update cells tp use an earth-spanning coordinate system anchored at Null Island
- [x] update style to be more intuitive
- [x] increase winning token requirement

## D3.c: Object persistence (game memory)

Key technical challenge: Can you make use of programming patterns to effectively save and load cell memory?
Key gameplay challenge: Can cells have a persistent memory that remembers what happens to them whether they are on the screen or not?

### Steps

- [x] define a cell factory to begin utilizing the flyweight pattern
- [x] replace my current cells array with a new "modifiedCells" map
- [x] update the updateVisibleCells() function to use the new flyweight logic
- [x] update the player actions to create cells
- [x] cache flyweight appearances to make it even more efficient
- [x] make sure cells save information and load them when necessary
- [ ] refactor memento pattern to separate data and visuals
