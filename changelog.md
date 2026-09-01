# Changelog

## v14.3.0 ## 2026-09-02: Why the Destination Is Missing

- **Fixed:** A pin no longer asks you to report a bug when there is nothing wrong with the pack. 
- **New:** The menu says why the destination is missing. 
- **Fixed:** Where a re-install actually repairs the pin, the menu now offers it.
- **Changed:** After you start an install from the menu and the destination still does not appear, the module asks again instead of trusting the answer it held before the download.
- **Changed:** When the module cannot prove why the destination is missing, it says nothing about the reason and simply offers the release.
- **Changed:** All of this needs Beneos module 14.4.8 to answer the question.
- **New:** Three new messages, translated across all 13 supported languages.

## v14.2.0 ## 2026-07-26: Destinations Resolved by Identity

- **Fixed:** The install hint no longer offers the wrong map. A pin used to be matched to a release by a number read out of its journal name, which is a label frozen when the pack was built. Where that label and the actual release had drifted apart, the hint named one release and the download delivered another, and the pin stayed broken afterwards. Destinations are now resolved by the identity of the target journal against an index built from the release packages themselves.
- **Fixed:** Releases with a letter suffix (20b, 42c, 57b, 93b and the rest) are reachable again. The suffix used to be discarded, so those pins always pointed at the base release.
- **Fixed:** After an install that produced no destination, the module used to fall silent. It now says what happened and logs the case, so a pack that is genuinely missing content can be reported instead of quietly wasting a download.
- **Fixed:** The audit tool and the live teleporter could disagree about a pin's target when a note referenced both a journal entry and a page. Both now resolve it the same way.
- **New:** The context menu names the destination. Instead of "Install Beneos Battlemaps Release 21 (Map 2, BM)" you see the actual release title, the destination scene inside it, and an install entry that names what it will download.
- **New:** When no release provides the destination, the menu says so and offers the Beneos Cloud browser. The number parsed from the name is still shown, but marked as unverified and never used to start a download. Guessing wrong costs you a multi-gigabyte download and does not fix the pin.
- **New:** Pins whose destination lives in more than one release show how many alternatives exist. The install entry keeps installing the canonical one, so it stays a single click.
- **Changed:** In worlds without the Beneos module nothing of this applies. No index is consulted, no cloud request is made and no install is offered, exactly as before. A journal id from your own world is never in the Beneos index, so the destination logic cannot misfire on your content.
- **Changed:** Journals that are documentation, navigation or lore are recognised by identity rather than by a word in the pin label, so they never produce an install offer.
- **Changed:** The install button, the missing-API warning and the post-install notice existed in English only. All three, plus the nine new messages, are now translated across all 13 supported languages.

## v14.1.3 ## 2026-07-19: Reliable Destination Detection
- **Fixed:** Right-clicking a teleporter pin whose destination is a rotated or tile-based battlemap no longer shows a false "install release" message. Those maps ship without a classic scene background and were wrongly treated as not installed, so navigation to them now works as expected.
- **Changed:** Install detection is now a single, simple rule: if a scene in your world is assigned the pin's destination journal, the destination counts as installed and the pin travels there; if no scene is assigned that journal, the pin shows the install hint (release number read from the journal name). The old background/content heuristic has been removed.
- **Changed:** Destination lookup now matches on the journal entry itself, so a pin resolves its scene whether the scene links the whole journal or a single journal page.

## v14.1.2 ## 2026-07-18
- **Update:**  We have now implemented a quick-installation feature for Beneos Battlemaps content.

## v14.1.1 ## 2026-04-21: Folder Structure Refactor
- **Changed:** Module layout now follows Foundry best practice and matches the `beneos-module` structure. Root no longer carries loose script/CSS/template files.
  - `poi-teleport.js`, `poi-audit.js` → `scripts/`
  - `poi-teleport.css`, `poi-audit.css` → `css/`
  - `poi-hud.html` → `templates/` (joins the other templates already there)
- **Changed:** `module.json` `scripts` and `styles` paths updated accordingly; HUD template reference in the code updated to `modules/poi-teleport/templates/poi-hud.html`. No functional change.

## v14.1.0 ## 2026-04-21: Beneos Binding & Setup Tools
- **New:** Beneos binding flags on POI notes (`isBeneos`, `targetName`, `releaseHint`, `mapHint`, `typeHint`, `hintKind`, `userOverride`). Survive deletion of the target journal so install hints stay precise even when the destination is gone.
- **New:** Backfill tool (Module Settings → *Backfill Beneos Flags*). Walks every scene in the world and writes Beneos binding flags to every POI note whose target journal matches the strict Beneos naming pattern. Setup-Mode gated, batched, with progress + confirm dialog.
- **New:** Setup Mode world setting (default **off**). Internal Beneos content-preparation switch that enables automatic flag-sync on `canvasReady` / `createNote` / `updateNote`, and reveals the Beneos binding fieldset in the Note Config sheet. End-users never see any of this; flags are still **read** regardless for error messages.
- **New:** Beneos binding fieldset injected into the native Note Config sheet (setup mode only). Editable isBeneos / targetName / release / map / type fields + "Detect from current Journal" button. Toggling isBeneos manually sets `userOverride`, so auto-sync leaves manual choices alone.
- **New:** Release-aware error messages include Map and Type codes where available (e.g. *"Install Beneos Battlemaps Release 06 (Map 02, SC)"*).
- **New:** Full 13-language coverage matching `beneos-module`: en, de, fr, es, it, pt-BR, pt-PT, pl, cs, ca, ja, ko, zh-TW. Old combined `pt.json` replaced by `pt-BR.json` + `pt-PT.json`.
- **New:** Context-menu info text for Navigation / Handout / Lore / Documentation journals is now localized (previously hardcoded English).
- **Changed:** Strict Beneos detection: only journal names matching `DontTouch-POI-Teleporter-*` (plus the Escalia special case) are flagged as Beneos. Handouts, Navigation, Lore and Documentation journals are never auto-flagged. `DontTouch_DiA_Map_*` auto-detection has been dropped.
- **Changed:** Context menu restyled to match the Beneos design system: gold text on dark background with gold stroke and glow, Roboto Condensed, left-aligned icon column, 45 px.
- **Changed:** Error message is now flag-gated. Notes not flagged as Beneos fall back to a neutral *"No destination scene configured for this note."* instead of the previous Beneos install hint.
- **Changed:** Removed context-menu entries *Toggle Navigation* and *Configure Note*. GMs reach the Note Config sheet via double-right-click on the icon.
- **Changed:** `auditCacheTargetName` default flipped to **off**, so end-users no longer pay a write cost every time a scene loads.
- **Changed:** Orphaned notes whose journal reference no longer resolves **and** that carry no `isBeneos` flag are now ignored entirely; POI attaches no HUD, letting user-owned notes behave like regular Foundry notes.
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

## v0.6.0: v13 API Fix
- Fixed: `note.document.entryId` for Foundry v13
- Switched HUD to ApplicationV2 pattern

## v0.4.3
- Initial release with basic teleport functionality
