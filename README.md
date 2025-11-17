# CMPM 121 D3 Project

Student: Andrew Degan (1930024)
Quarter: Fall 2025

In this demo, the user is able to play a game that combines the real-world traversal controls of games like Pokemon GO with the collection and merging mechanics of the game 2048.
The player is dropped in their current geolocation using their GPS. The world will be covered in an array of cells that the player is able to interact with, stretching on seemingly indefinitely. Each cell has a value (75% value 2, 25% value 4) that the player is able to see indicated by their color. Each cell provides two actions: Take the current cell's token value and hold it in your hand, or Place the token value from your hand on another cell. If the cell's value matches that of your hand, they will merge and provide a new token of double value. The goal of the player is to collect enough tokens to reach the target score goal (first, 64, then 2048), however the player is only able to interact with cells within close proximity of themselves, requiring them to move around the real-world to access more cells.

This game utilizes the leaflet map and a luck seed from a library provided by CMPM 121. The player is able to drag on the map in order to look around the world, tap on cells within their range to open a popup and see their value, tap on cell buttons to take or place, use a centering button (📍) to center the map on their location (if they get lost), and open a small settings page (⚙️) that allows the player to reset their game (erasing save data) or switch from GPS movement to manual movement (using a d-pad at the bottom of their screen).

The game makes use of various patterns such as flyweight to efficiently create thousands of similar cells and a uses memento-akin pattern to store cell data in a map, which is saved with other variables to allow players to easily open and close the game without losing any progress.

This game works on any web browser as long as the user has GPS enabled, making play on PC or mobile devices simple.
