# Changelog

## v14.1.3 ## 2026-07-19 — Reliable Destination Detection
- **Fixed:** Right-clicking a teleporter pin whose destination is a rotated or tile-based battlemap no longer shows a false "install release" message. Those maps ship without a classic scene background and were wrongly treated as not installed, so navigation to them now works as expected.
- **Changed:** Install detection is now a single, simple rule: if a scene in your world is assigned the pin's destination journal, the destination counts as installed and the pin travels there; if no scene is assigned that journal, the pin shows the install hint (release number read from the journal name). The old background/content heuristic has been removed.
- **Changed:** Destination lookup now matches on the journal entry itself, so a pin resolves its scene whether the scene links the whole journal or a single journal page.

## v14.1.2 ## 2026-07-18
- **Update:**  We have now implemented a quick-installation feature for Beneos Battlemaps content.

## v14.1.1 ## 2026-04-21 — Folder Structure Refactor
- **Changed:** Module layout now follows Foundry best practice and matches the `beneos-module` structure. Root no longer carries loose script/CSS/template files.
  - `poi-teleport.js`, `poi-audit.js` → `scripts/`
  - `poi-teleport.css`, `poi-audit.css` → `css/`
  - `poi-hud.html` → `templates/` (joins the other templates already there)
- **Changed:** `module.json` `scripts` and `styles` paths updated accordingly; HUD template reference in the code updated to `modules/poi-teleport/templates/poi-hud.html`. No functional change.

## v14.1.0 ## 2026-04-21 — Beneos Binding & Setup Tools
- **New:** Beneos binding flags on POI notes (`isBeneos`, `targetName`, `releaseHint`, `mapHint`, `typeHint`, `hintKind`, `userOverride`). Survive deletion of the target journal so install hints stay precise even when the destination is gone.
- **New:** Backfill tool (Module Settings → *Backfill Beneos Flags*). Walks every scene in the world and writes Beneos binding flags to every POI note whose target journal matches the strict Beneos naming pattern. Setup-Mode gated, batched, with progress + confirm dialog.
- **New:** Setup Mode world setting (default **off**). Internal Beneos content-preparation switch that enables automatic flag-sync on `canvasReady` / `createNote` / `updateNote`, and reveals the Beneos binding fieldset in the Note Config sheet. End-users never see any of this — flags are still **read** regardless for error messages.
- **New:** Beneos binding fieldset injected into the native Note Config sheet (setup mode only). Editable isBeneos / targetName / release / map / type fields + "Detect from current Journal" button. Toggling isBeneos manually sets `userOverride`, so auto-sync leaves manual choices alone.
- **New:** Release-aware error messages include Map and Type codes where available (e.g. *"Install Beneos Battlemaps Release 06 (Map 02, SC)"*).
- **New:** Full 13-language coverage matching `beneos-module`: en, de, fr, es, it, pt-BR, pt-PT, pl, cs, ca, ja, ko, zh-TW. Old combined `pt.json` replaced by `pt-BR.json` + `pt-PT.json`.
- **New:** Context-menu info text for Navigation / Handout / Lore / Documentation journals is now localized (previously hardcoded English).
- **Changed:** Strict Beneos detection — only journal names matching `DontTouch-POI-Teleporter-*` (plus the Escalia special case) are flagged as Beneos. Handouts, Navigation, Lore and Documentation journals are never auto-flagged. `DontTouch_DiA_Map_*` auto-detection has been dropped.
- **Changed:** Context menu restyled to match the Beneos design system — gold text on dark background with gold stroke and glow, Roboto Condensed, left-aligned icon column, 45 px.
- **Changed:** Error message is now flag-gated. Notes not flagged as Beneos fall back to a neutral *"No destination scene configured for this note."* instead of the previous Beneos install hint.
- **Changed:** Removed context-menu entries *Toggle Navigation* and *Configure Note*. GMs reach the Note Config sheet via double-right-click on the icon.
- **Changed:** `auditCacheTargetName` default flipped to **off**, so end-users no longer pay a write cost every time a scene loads.
- **Changed:** Orphaned notes whose journal reference no longer resolves **and** that carry no `isBeneos` flag are now ignored entirely — POI attaches no HUD, letting user-owned notes behave like regular Foundry notes.
- **Fixed:** HUD no longer force-overrides font size via inline style, so CSS owns the typography.
- **Fixed:** Audit cache writes now use a no-op compare + `userOverride` guard to avoid redundant note updates.
- **Fixed:** `renderNoteConfig` injection hardened for both V13 jQuery and V14 ApplicationV2 HTMLElement, with fallback insertion strategies and visible console warnings when a form cannot be resolved.

## v13.0.2 ## 2026-03-07 - Hotfix
- Fixed: Redundant badge inputs have been removed, which caused levels and CR displays to be shown incorrectly.

## v13.0.1 ## 2026-03-05
- New: Destination validation (missing scenes show error menu)
- New: Custom error messages with i18n (EN, ES, FR)
- New: Release detection (DontTouch-POI-Teleporter-XX, Escalia, DiA)
- New: Audit tool (Module Settings → scan world for broken links)
- New: Batched audit scanning (25 scenes/batch, yields to event loop)
- New: Target name caching in note flags (Now displays the target release number - after reupload)
- New: Dual HUD support (ApplicationV2 for v13, BasePlaceableHUD for v12)
- Improved: Foundry v13 API compatibility (`note.document.entryId`)
- Fixed: Disabled/red menu items for missing targets

## v13.0.0 ## 2025-05-20
Update: V13 compatibility
Added: Max Foundry Versions to older module versions to make them appear only in compatible versions.

## v0.6.0 — v13 API Fix
- Fixed: `note.document.entryId` for Foundry v13
- Switched HUD to ApplicationV2 pattern

## v0.4.3
- Initial release with basic teleport functionality
