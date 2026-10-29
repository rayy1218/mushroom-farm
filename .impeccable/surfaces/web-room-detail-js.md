---
version: 1
slug: "web-room-detail-js"
primary_target: "web/room-detail.js"
related_targets: ["web/route.js"]
---

# Room page

Scope: the room page (`#/rooms/:id` and its tabs), desktop and phone. Visitor mode: Operate.

Audience and job: farm workers at the room door on a phone (is the room OK, what is wrong, take over a machine) and the owner at a desk (tune bands, read history and energy, set up equipment). Constraints: keep the Overview's content and the room drawing's representation (air path, condenser outside, machines in air order, shelves of blocks); plain English; metric units; colour means problems; dark theme by default with a light toggle.

Structure decided: 5 tabs, Now (readings first, alarms, the drawing, machines with Auto | Manual and manual control), History (charts and energy), Crop, Simulations, Setup (bands and automatic control settings, sensors, equipment, room profile and delete).

Unresolved: none at direction time; sensors' live status sits on Now only through alarms and the machine/sensor states, its settings on Setup.

## Direction contract

THESIS: The category standard played straight: a clean climate-controller dashboard where the room's state is legible in one glance. It refuses today's arrangement of one designed tab and eight raw forms, and refuses decoration standing in for state.

OWN-WORLD: Neutral dark ground (light theme mirrors it) with one blue accent for selection, primary action and "running"; green for in band, amber for warning, red for fault, nothing else coloured. One card level with hairline borders and soft radius, a modern neutral sans with tabular figures, a tight 1.2 type scale, status pills, segmented controls, underline tabs. Sits beside Grafana, Home Assistant, Vercel/Linear and UniFi at their craft level.

STORY: The visitor sees whether the room is fine before anything else, sees what is wrong and since when, sees what every machine is doing and why, and can take over in two taps. The owner trusts the numbers because every tab shows the same ones.

FIRST VIEWPORT: Top bar (brand, room switcher, Live, theme, Settings). Room title with size. Underline tabs Now, History, Crop, Simulations, Setup. Row of three reading cards (value, status, band, last-hour trace with the band shaded). Right column: active alarm card, Control card with Auto | Manual, Crop card with day progress. Below: the room drawing card (wide) and the Machines list in air order with status pills. Phone: readings first, alarm, control, machines, drawing.

FORM: category standard (canon, the standing exit; not on the ordered list), chosen sketch `.impeccable/mocks/decision/canon.html`. seed:aaefa248ba32b58c

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
