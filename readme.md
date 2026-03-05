# Point of Interest Teleporter

Activate, view, and preload scenes directly from map notes in Foundry VTT.

## Features

### Core Teleportation
- **Right-click** any linked map note to see a context menu
- **View Scene** — Preview the destination scene
- **Activate Scene** — Teleport all players to the scene (GM only)
- **Preload Scene** — Preload scene textures for faster transitions (GM only)
- **Toggle Navigation** — Show/hide the scene in the nav bar (GM only)

### Destination Validation
- Notes pointing to **missing scenes** show a red, disabled menu item
- **Release detection** identifies which Beneos Battlemaps release is needed
- Patterns detected:
  - `DontTouch-POI-Teleporter-XX` → "Install Release XX"
  - Escalia references → "Install Escalia expansion"
  - DiA maps → "Install Release 96"
- Falls back to cached target names from the audit tool

### Audit Tool
- Access via **Module Settings → Open Audit Window**
- Scans **all scenes** for broken POI links
- Reports **MISSING** (journal exists but no scene link) and **INVALID** (no journal reference) notes
- Processes in batches of 25 to handle 1000+ scenes without freezing
- **Go to Source** — Navigate directly to the broken note
- **Copy Info** — Copy link details to clipboard
- Optional **target name caching** stores names in note flags for future reference

### Internationalization
- English, Spanish, and French translations included

## Compatibility
- Foundry VTT v11, v12, v13+
- Dual HUD implementation:
  - v13+: ApplicationV2 with HandlebarsApplicationMixin
  - v12: Legacy BasePlaceableHUD

## Installation
1. In Foundry VTT, go to **Add-on Modules → Install Module**
2. Paste the manifest URL or upload the zip file
3. Enable the module in your world

## Authors
- **zeel** — Original development
- **Beneos** — Design and concept
