# Room profile and Equipment tabs instead of the Edit dialog (iteration 16)

Date: 2026-10-26 · Branch `v2` · After iteration 15 (lights). Web only: the rooms API (GET / PUT / DELETE `/api/rooms/:id`) does not change.

The owner asked (2026-10-26): "the edit room split it to 2 new tab, room profile and equipment". The lead chose every default (*default*).

## 1. The room page

| Item | Rule |
|---|---|
| Tabs | two more after Simulations: **Room profile** `#/rooms/:id/profile` and **Equipment** `#/rooms/:id/equipment` (`ROOM_TABS`, with icons in the side bar) |
| Edit button | gone from the room page's head (the tabs replace it) |
| Rooms list | its Edit opens the room's Room profile tab; Add room keeps the dialog with every field (a new room needs its name and size; its equipment can be set there or later on the Equipment tab) |

## 2. Room profile tab

| Item | Rule |
|---|---|
| Card "Room profile" | Name, Length, Width, Height (m) and the volume worked out live, as in the dialog |
| Save | Save and Reset (shown with unsaved changes); errors under the fields in the server's words; a good save refreshes the page head and the other tabs |
| Delete | a "Delete room" card under it (danger button, the same confirm as the Rooms list: "Delete Room 1? This can't be undone."); after a delete: the Rooms list |

## 3. Equipment tab

| Card (in this order) | Fields |
|---|---|
| Sensors (Modbus address) | T/RH probe, CO₂ sensor, energy meter, filter pressure sensor |
| Machines | relay module address, aircon gateway address, dehumidifier fitted, lights fitted |
| Power and water (for the usage estimates) | the ratings, the dehumidifier's and the lights' only when fitted |
| Intake filter | fan maximum pressure, clean pressure drop, change pressure, change every (days) |
| Save | one Save and Reset for the tab (only one form is edited at a time, so a Save never overwrites another card's unsent edit); the full room sent (PUT replaces fields left out: the tab merges its values into the loaded room) |

## 4. Code

| Item | Rule |
|---|---|
| Shared field definitions | one pure module (e.g. `web/room-fields.js`) with every room field's label, unit, range, group and check, used by the Add dialog and both tabs, so they cannot drift; the server's checks stay the reference (same words) |
| Live data | the tabs fill from the room the page already loads; a refresh never replaces a field being edited (like the Crop card) |
| Tests | the field definitions match `server/rooms.js` ranges and words; the body sent merges the loaded room; the tab list and addresses; source checks that the room page has no Edit button and the Rooms list Edit goes to the profile tab; browser check on a throwaway app (desktop and phone) |
