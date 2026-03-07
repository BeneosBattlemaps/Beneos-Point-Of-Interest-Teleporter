# Changelog

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
