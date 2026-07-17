/**
 * POI Teleporter v10 — Robust Non-POI Guard & Documentation Support
 *
 * Combines Foundry v13 API compatibility with all features:
 * - Destination validation (missing scenes show error menu)
 * - Content-type detection (Navigation/Handout/Lore/Documentation info text)
 * - Robust Non-POI guard (ignores icons with empty/null journal references)
 * - Custom error messages + i18n
 * - Disabled/red menu items for missing targets
 * - Release detection ("Install Release XX")
 * - Audit tool integration (via poi-audit.js)
 * - Fixed font-size (50px, not scaled by icon size)
 *
 * Compatible with Foundry v13+.
 *
 * @class PointOfInterestTeleporter
 */
class PointOfInterestTeleporter {
	static MODULE_ID = "poi-teleport";

	/**
	 * Handles on the canvasReady Hook.
	 *
	 * Checks all notes, and adds event listeners for
	 * closing the note context menu.
	 *
	 * @static
	 * @memberof PointOfInterestTeleporter
	 */
	static async onReady() {
		canvas.notes.placeables.forEach(n => this.checkNote(n));

		canvas.mouseInteractionManager.target.on("rightdown", () => {
			canvas.hud?.poiTp?.close?.();
		});
		canvas.mouseInteractionManager.target.on("mousedown", () => {
			canvas.hud?.poiTp?.close?.();
		});

		console.log(game.i18n.localize("poitp.name"), "| Ready.");
	}

	/**
	 * Handles renderHeadsUpDisplay / renderHeadsUpDisplayContainer Hook.
	 *
	 * Creates a new HUD for map notes,
	 * and adds it to the document.
	 *
	 * @static
	 * @param {HeadsUpDisplay} hud - The heads up display container class
	 * @param {jquery|HTMLElement} html - The html of the HUD
	 * @memberof PointOfInterestTeleporter
	 */
	static renderHeadsUpDisplay(hud, html) {
		hud.poiTp = new PoiTpHUD();
		// Ensure canvas.hud.poiTp is always reachable
		if (canvas?.hud && canvas.hud !== hud) canvas.hud.poiTp = hud.poiTp;
	}

	/**
	 * Handles the createNote Hook.
	 *
	 * @static
	 * @param {NoteDocument} noteDocument - The document associated with the new note
	 * @memberof PointOfInterestTeleporter
	 */
	static async createNote(noteDocument) {
		if (noteDocument.object) return this.checkNote(noteDocument.object);
	}

	/**
	 * Handles updateNote Hook.
	 *
	 * @static
	 * @param {NoteDocument} noteDocument - The document associated with the new note
	 * @memberof PointOfInterestTeleporter
	 */
	static async updateNote(noteDocument) {
		if (noteDocument.object) return this.checkNote(noteDocument.object);
	}

	/**
	 * Handles the getSceneDirectoryEntryContext Hook.
	 *
	 * Adds a new item to the scene directory context
	 * menu. The new item allows for a new scene note
	 * to be created in one click.
	 *
	 * @static
	 * @param {jquery} html - The HTML of the directory tab
	 * @param {object[]} options - An array of objects defining options in the context menu
	 * @memberof PointOfInterestTeleporter
	 */
	static getSceneDirEnCtx(html, options) {
		options.splice(2, 0, {
			name: "poitp.createNote",
			icon: '<i class="fas fa-scroll"></i>',
			condition: li => {
				const scene = game.scenes.get(li.data("documentId"));
				return !scene.journal;
			},
			callback: li => {
				const scene = game.scenes.get(li.data("documentId"));
				JournalEntry.create({
					name: scene.name,
					type: "base",
					types: "base"
				}, { renderSheet: true })
				.then(entry => scene.update({ "journal": entry.id }));
			}
		});
	}

	/**
	 * Returns a promise that resolves on the next animation frame.
	 *
	 * @static
	 * @return {Promise} A promise that resolves on the next animation frame
	 * @memberof PointOfInterestTeleporter
	 */
	static nextFrame() {
		return new Promise(resolve => window.requestAnimationFrame(resolve));
	}

	/**
	 * Waits for the existence of a property on an object, or some limited number of loops.
	 *
	 * @static
	 * @param {object} object
	 * @param {string} property
	 * @param {number} limit
	 * @memberof PointOfInterestTeleporter
	 * @return {Promise<boolean>} A promise that resolves when the property exists, or the limit is reached
	 */
	static async waitFor(object, property, limit) {
		for (; limit > 0 && !object[property]; limit--) await this.nextFrame();
		return Boolean(object[property]);
	}

	/**
	 * Checks if the supplied note is associated with a scene.
	 *
	 * Three cases:
	 *  1. No journal reference (no entryId AND no pageId) → skip entirely (not a POI)
	 *  2. Has journal reference but no matching scene → error menu (missing destination)
	 *  3. Has journal reference and matching scene → navigation menu
	 *
	 * FOUNDRY v13 COMPATIBLE: Uses note.document.entryId (not deprecated note.entry.id)
	 *
	 * @static
	 * @param {Note} note - A map note to check
	 * @memberof PointOfInterestTeleporter
	 */
	static async checkNote(note) {
		const noteDoc = note?.document;
		if (!noteDoc) return;

		// Raw string IDs — reliable even if the referenced journal/page is missing.
		const notePageId = noteDoc.pageId;    // string | null
		const noteEntryId = noteDoc.entryId;  // string | null  (v13 API)

		// If no journal reference at all, this is not a POI icon (e.g. a Handout) — skip entirely
		// Also skip empty strings (icons with cleared journal references)
		const hasPageId = notePageId && notePageId.trim() !== "";
		const hasEntryId = noteEntryId && noteEntryId.trim() !== "";
		if (!hasPageId && !hasEntryId) return;

		// Look up the referenced journal entry
		let journal = null;
		if (hasEntryId) {
			journal = game.journal?.get(noteEntryId);
		} else if (hasPageId) {
			// Find journal that contains this page
			for (const entry of game.journal ?? []) {
				if (entry.pages?.get?.(notePageId)) {
					journal = entry;
					break;
				}
			}
		}

		// Journal missing → only attach POI behaviour when the note is explicitly
		// flagged as a Beneos teleporter. Orphaned references on user-owned notes
		// (journal was deleted, or never resolved) are treated as non-POI content
		// and left to Foundry's default behaviour.
		if (!journal) {
			// Journal genuinely missing (rare now that destination journals ship
			// in every pack). Fall back to the note label to decide Beneos-ness;
			// non-Beneos orphan notes bail out and keep Foundry's default behaviour.
			const binding = PointOfInterestTeleporter.parseBinding(noteDoc.text);
			if (!binding.isBeneos) return;

			if (!await this.waitFor(note, "mouseInteractionManager", 60)) return;
			const missingNoteText = noteDoc.text?.toLowerCase() ?? "";
			let missingContentType = null;
			if (missingNoteText.includes("navigator") || missingNoteText.includes("navigation")) {
				missingContentType = "navigation";
			} else if (missingNoteText.startsWith("handout")) {
				missingContentType = "handout";
			} else if (missingNoteText.includes("lore")) {
				missingContentType = "lore";
			} else if (missingNoteText.includes("documentation")) {
				missingContentType = "documentation";
			}
			new PointOfInterestTeleporter(note, null, missingContentType);
			return;
		}

		// Journal exists → check for content-type hints (Navigation/Handout/Lore/Documentation)
		const journalName = journal.name?.toLowerCase() ?? "";
		let contentType = null;

		if (journalName.includes("navigation")) {
			contentType = "navigation";
		} else if (journalName.includes("handout")) {
			contentType = "handout";
		} else if (journalName.includes("lore")) {
			contentType = "lore";
		} else if (journalName.includes("documentation")) {
			contentType = "documentation";
		}

		// Content-type detected → info-text menu (no scene lookup needed)
		if (contentType) {
			if (!await this.waitFor(note, "mouseInteractionManager", 60)) return;
			new PointOfInterestTeleporter(note, null, contentType);
			return;
		}

		// Regular POI → look up the target scene
		let scene = null;

		// Collect every matching scene. A release that was later installed can
		// leave its repack placeholder behind alongside the real scene, so we
		// prefer a real (non-placeholder) match over a placeholder one.
		let matches = [];
		if (hasPageId) {
			// Scene.journalEntryPage is always the raw pageId string
			matches = game.scenes.filter(s => s.journalEntryPage === notePageId);
		} else if (hasEntryId) {
			// Scene.journal is a resolved JournalEntry document (compare via .id)
			matches = game.scenes.filter(s => !s.journalEntryPage && s.journal?.id === noteEntryId);
		}
		scene = matches.find(s => !this.sceneIsUninstalledPlaceholder(s)) ?? matches[0] ?? null;

		// New-repack model: a not-installed Beneos release ships a placeholder
		// scene (background.src null) that links to the teleporter journal, so
		// the lookup above resolves it. Treat such a placeholder as "destination
		// not installed" so the install hint/menu shows instead of View/Activate.
		// Gated to Beneos notes so genuinely empty user scenes stay navigable.
		const binding = PointOfInterestTeleporter.parseBinding(journal?.name);
		if (scene && binding.isBeneos && this.sceneIsUninstalledPlaceholder(scene)) {
			scene = null;
		}

		// Wait for mouse interaction manager (needed to attach right-click handler)
		if (!await this.waitFor(note, "mouseInteractionManager", 60)) return;

		// scene found → navigation menu; scene null → error menu (missing destination)
		new PointOfInterestTeleporter(note, scene ?? null, null);
	}

	/**
	 * Whether a resolved scene is an uninstalled placeholder, i.e. it has no
	 * real background asset. Beneos repacks ship such placeholder scenes for
	 * releases whose battlemap assets are not installed in the world.
	 * V13 reads scene.background.src; V14 prefers scene.firstLevel.background.src.
	 *
	 * @param {Scene} scene
	 * @return {boolean}
	 * @memberof PointOfInterestTeleporter
	 */
	static sceneIsUninstalledPlaceholder(scene) {
		if (!scene) return false;
		const src = scene.firstLevel?.background?.src ?? scene.background?.src ?? null;
		return !src || String(src).trim() === "";
	}

	/**
	 * Creates an instance of PointOfInterestTeleporter.
	 *
	 * @param {Note} note - A map note
	 * @param {Scene|null} scene - A target scene (null = missing destination)
	 * @param {string|null} contentType - Content type hint ("navigation", "handout", "lore", or null)
	 * @memberof PointOfInterestTeleporter
	 */
	constructor(note, scene, contentType = null) {
		this.note = note;
		this.scene = scene; // can be null when destination is missing
		this.contentType = contentType; // "navigation", "handout", "lore", or null

		this.activateListeners();
	}

	/**
	 * Activate any event handlers
	 *
	 * @memberof PointOfInterestTeleporter
	 */
	activateListeners() {
		this.note.mouseInteractionManager.target.on("rightdown", this._contextMenu.bind(this));
	}

	/**
	 * Handle the right click event
	 *
	 * Binds this note to the context menu HUD
	 * and prevents the event from bubbling
	 *
	 * @param {Event} event - The event that triggered this callback
	 * @memberof PointOfInterestTeleporter
	 */
	_contextMenu(event) {
		event.stopPropagation();

		const now = Date.now();
		const timeSinceLast = now - (this._lastRightClickTime ?? 0);
		this._lastRightClickTime = now;

		// Doppelrechtsklick (< 300ms): native Note-Konfiguration öffnen
		if (timeSinceLast < 300) {
			this._lastRightClickTime = 0; // Reset: Triple-Klick verhindern
			canvas.hud?.poiTp?.close?.();

			this.note.document.sheet?.render({ force: true });
			return;
		}

		if (!canvas?.hud?.poiTp) {
			ui.notifications?.warn(game.i18n.localize("poitp.destinationNotInWorld"));
			return;
		}
		canvas.hud.poiTp.bind(this);
	}

	/**
	 * Convenience alias for the note x coordinate
	 *
	 * @readonly
	 * @memberof PointOfInterestTeleporter
	 */
	get x() { return this.note.x; }

	/**
	 * Convenience alias for the note y coordinate
	 *
	 * @readonly
	 * @memberof PointOfInterestTeleporter
	 */
	get y() { return this.note.y; }

	/**
	 * Get best-effort target name from flags cache, note text, or journal lookup.
	 * Used by getReleaseMessage() to determine the appropriate error message.
	 *
	 * @return {string|null} The target name, or null if unavailable
	 * @memberof PointOfInterestTeleporter
	 */
	_getTargetName() {
		// The destination journal is always packed into the release (even when
		// its scene is absent), so the live journal name is the ground truth.
		const entryId = this.note?.document?.entryId;
		if (entryId) {
			const entry = game.journal?.get(entryId);
			if (entry?.name) return entry.name;
		}
		const pageId = this.note?.document?.pageId;
		if (pageId) {
			for (const entry of game.journal ?? []) {
				const page = entry.pages?.get?.(pageId);
				if (page) return `${entry.name} / ${page.name}`;
			}
		}

		// Note text/label — last resort (human-readable label, usually not a release ID)
		return this.note?.document?.text || null;
	}

	/**
	 * Resolve the Beneos binding purely from the target journal name. The note
	 * flags are no longer consulted: every destination journal is now shipped
	 * inside the release pack, so its name is the single source of truth.
	 *
	 * @param {string|null} name  the resolved journal/target name
	 * @return {{isBeneos:boolean, hintKind:string, releaseHint:?number, mapHint:?number, typeHint:?string, name:?string}}
	 * @memberof PointOfInterestTeleporter
	 */
	static parseBinding(name) {
		let parsed = null;
		try {
			if (typeof PoiTpAudit !== "undefined") parsed = PoiTpAudit.parseReleaseHint(name);
		} catch (_e) { /* parser unavailable */ }
		return {
			isBeneos: parsed?.isBeneos === true,
			hintKind: parsed?.hintKind ?? "none",
			releaseHint: parsed?.releaseHint ?? null,
			mapHint: parsed?.mapHint ?? null,
			typeHint: parsed?.typeHint ?? null,
			name: name ?? null
		};
	}

	/**
	 * Resolve this note's Beneos binding from its live target journal name.
	 *
	 * @return {{isBeneos:boolean, hintKind:string, releaseHint:?number, mapHint:?number, typeHint:?string, name:?string}}
	 * @memberof PointOfInterestTeleporter
	 */
	_resolveBeneosBinding() {
		return PointOfInterestTeleporter.parseBinding(this._getTargetName());
	}

	/**
	 * Determine the appropriate error message for a missing destination.
	 * Beneos-branding is decided by the binding (journal name first, then baked
	 * flags), so a non-Beneos journal note still shows the neutral message.
	 *
	 * @return {string} A localized error message
	 * @memberof PointOfInterestTeleporter
	 */
	getReleaseMessage() {
		const b = this._resolveBeneosBinding();

		// Not a Beneos teleporter → neutral, non-Beneos message.
		if (!b.isBeneos) {
			return game.i18n.localize("poitp.destinationNotConfigured");
		}

		// Beneos with release + map + type → richest message.
		if (b.hintKind === "release" && b.releaseHint != null) {
			if (b.mapHint != null && b.typeHint) {
				return game.i18n.format("poitp.destinationInstallReleaseMapType", {
					release: b.releaseHint,
					map: b.mapHint,
					type: b.typeHint
				});
			}
			if (b.mapHint != null) {
				return game.i18n.format("poitp.destinationInstallReleaseMap", {
					release: b.releaseHint,
					map: b.mapHint
				});
			}
			return game.i18n.format("poitp.destinationInstallRelease", {
				release: b.releaseHint
			});
		}

		if (b.hintKind === "escalia") {
			return game.i18n.localize("poitp.destinationInstallEscalia");
		}

		if (b.hintKind === "dia96") {
			return game.i18n.format("poitp.destinationInstallRelease", { release: 96 });
		}

		// Beneos but no specific hint → generic Beneos message.
		return game.i18n.localize("poitp.destinationInstallBeneosGeneric");
	}

	/**
	 * Whether the "Install Missing Pack" action can be offered for this note.
	 * Requires a GM, a Beneos-flagged note, and the Beneos module's public
	 * install API. In worlds without the Beneos module nothing is offered and
	 * only the plain release hint is shown.
	 *
	 * @return {boolean}
	 * @memberof PointOfInterestTeleporter
	 */
	_canInstallMissingPack() {
		if (!game.user?.isGM) return false;
		if (!this._resolveBeneosBinding().isBeneos) return false;
		if (!game.modules?.get?.("beneos-module")?.active) return false;
		return typeof game.beneos?.api?.installReleaseByNumber === "function";
	}

	/**
	 * Hands the missing release off to the Beneos module's install API. The API
	 * resolves the release number, gates on Patreon access (opening the cloud
	 * window with the Join state when the user has no access), and otherwise
	 * shows a confirmation with 4K/HD choice and download size before installing.
	 *
	 * @memberof PointOfInterestTeleporter
	 */
	installMissingPack() {
		canvas.hud?.poiTp?.close?.();

		const install = game.beneos?.api?.installReleaseByNumber;
		if (typeof install !== "function") {
			return ui.notifications?.warn(game.i18n.localize("poitp.installApiMissing"));
		}

		const b = this._resolveBeneosBinding();
		let releaseNum;
		if (b.hintKind === "release" && b.releaseHint != null) releaseNum = b.releaseHint;
		else if (b.hintKind === "dia96") releaseNum = 96;

		// releaseNum may be undefined (e.g. Escalia / Landing Page / other special
		// release with no numeric hint). We pass the journal name so the API can
		// resolve it against the cloud catalog's display_name; failing that it
		// opens the cloud browser so the user is never stuck.
		//
		// The API promise resolves only AFTER the native installer has created the
		// scene documents, so we can re-resolve our destination immediately and
		// flip this teleporter to "navigation" without a reload.
		Promise.resolve(install(releaseNum, { mapHint: b.mapHint, typeHint: b.typeHint, name: b.name }))
			.then(() => this._refreshDestinationAfterInstall())
			.catch(err => {
				console.warn("poi-teleport | installMissingPack failed", err);
				ui.notifications?.error(game.i18n.localize("poitp.installApiMissing"));
			});
	}

	/**
	 * Resolve the destination scene this note points at, applying the same
	 * placeholder filtering as checkNote(): prefer a real (installed) scene over
	 * a not-installed placeholder, and treat a lone placeholder as "missing".
	 *
	 * @return {Scene|null}
	 * @memberof PointOfInterestTeleporter
	 */
	_lookupScene() {
		const doc = this.note?.document;
		if (!doc) return null;
		const pageId = (doc.pageId && doc.pageId.trim() !== "") ? doc.pageId : null;
		const entryId = (doc.entryId && doc.entryId.trim() !== "") ? doc.entryId : null;

		let matches = [];
		if (pageId) matches = game.scenes.filter(s => s.journalEntryPage === pageId);
		else if (entryId) matches = game.scenes.filter(s => !s.journalEntryPage && s.journal?.id === entryId);

		let scene = matches.find(s => !PointOfInterestTeleporter.sceneIsUninstalledPlaceholder(s)) ?? matches[0] ?? null;
		if (scene && this._resolveBeneosBinding().isBeneos && PointOfInterestTeleporter.sceneIsUninstalledPlaceholder(scene)) {
			scene = null;
		}
		return scene;
	}

	/**
	 * After a triggered install completes, re-resolve the destination. If the
	 * release's real scene now exists, flip this teleporter from "missing" to
	 * "navigation" so the next right-click travels there directly (no reload).
	 * A no-op when nothing was installed (cancelled / no access / failed).
	 *
	 * @memberof PointOfInterestTeleporter
	 */
	_refreshDestinationAfterInstall() {
		const scene = this._lookupScene();
		if (!scene) return;
		this.scene = scene;
		this.contentType = null;
		ui.notifications?.info(game.i18n.format("poitp.installReadyNotice", { name: scene.name }));
	}

	/**
	 * @typedef ContextMenuOption
	 * @property {string} icon - A string of HTML representing a Font Awesome icon
	 * @property {string} title - The text, or i18n reference, for the text to display on the option
	 * @property {string} [trigger] - The name of a method of PointOfInterestTeleporter to call
	 * @property {boolean} [rawTitle] - If true, title is already localized (do not pass through localize)
	 * @property {boolean} [disabled] - If true, option is disabled (not clickable)
	 * @property {boolean} [error] - If true, option is styled as an error
	 * @property {boolean} [info] - If true, option is styled as info (white text, dark bg, no icon)
	 *//**
	 * Returns an array of menu options for the context menu.
	 *
	 * @return {ContextMenuOption[]}
	 * @memberof PointOfInterestTeleporter
	 */
	getOptions() {
		// Content-type info text (Navigation/Handout/Lore/Documentation)
		if (this.contentType) {
			const infoKeyByType = {
				navigation:    "poitp.contentType.navigation",
				handout:       "poitp.contentType.handout",
				lore:          "poitp.contentType.lore",
				documentation: "poitp.contentType.documentation"
			};
			const infoKey = infoKeyByType[this.contentType] ?? "poitp.contentType.generic";
			return [{
				icon: '', // No icon for info text
				title: game.i18n.localize(infoKey),
				rawTitle: true,
				disabled: true,
				info: true
			}];
		}

		// Missing destination → disabled error item with release detection.
		// Config access is intentionally not offered here — GMs reach the note
		// configuration via double-right-click on the icon.
		if (!this.scene) {
			const items = [{
				icon: '<i class="fas fa-exclamation-triangle fa-fw"></i>',
				title: this.getReleaseMessage(),
				rawTitle: true,
				disabled: true,
				error: true
			}];

			// When the Beneos module is installed, offer a one-click install of
			// the missing release straight from here. Gated to GMs and Beneos
			// notes; the heavy lifting (access check, confirmation with 4K/HD +
			// download size, the installer itself) lives behind the Beneos API.
			if (this._canInstallMissingPack()) {
				items.push({
					icon: '<i class="fas fa-cloud-download-alt fa-fw"></i>',
					title: "poitp.installMissingPack",
					trigger: "installMissingPack"
				});
			}

			return items;
		}

		const options = [
			{
				icon: '<i class="fas fa-eye fa-fw"></i>',
				title: "poitp.view",
				trigger: "viewScene"
			}
		];

		if (game.user.isGM) {
			options.push(
				{
					icon: '<i class="fas fa-bullseye fa-fw"></i>',
					title: "poitp.activate",
					trigger: "activateScene"
				},
				{
					icon: '<i class="fas fa-download fa-fw"></i>',
					title: "poitp.preLoadScene",
					trigger: "preLoadScene"
				}
			);
		}

		return options;
	}

	/**
	 * Activates the scene.
	 *
	 * @memberof PointOfInterestTeleporter
	 */
	activateScene() {
		if (!this.scene) return ui.notifications?.warn(game.i18n.localize("poitp.destinationNotInWorld"));
		this.scene.activate();
	}

	/**
	 * Shows the scene, but doesn't activate it.
	 *
	 * @memberof PointOfInterestTeleporter
	 */
	viewScene() {
		if (!this.scene) return ui.notifications?.warn(game.i18n.localize("poitp.destinationNotInWorld"));
		this.scene.view();
	}

	/**
	 * Toggles whether or not the scene is shown in the navigation bar.
	 *
	 * @memberof PointOfInterestTeleporter
	 */
	toggleNav() {
		if (!this.scene) return ui.notifications?.warn(game.i18n.localize("poitp.destinationNotInWorld"));
		this.scene.update({ navigation: !this.scene.navigation });
	}

	/**
	 * Preloads the scene textures and data.
	 *
	 * @memberof PointOfInterestTeleporter
	 */
	preLoadScene() {
		if (!this.scene) return ui.notifications?.warn(game.i18n.localize("poitp.destinationNotInWorld"));
		game.scenes.preload(this.scene.id, true);
	}

	/**
	 * Opens the Foundry standard Note configuration sheet.
	 * Allows GMs to change the journal reference, icon, label, etc.
	 *
	 * @memberof PointOfInterestTeleporter
	 */
	configureNote() {
		if (!this.note?.document?.sheet) return;
		this.note.document.sheet.render({ force: true });
		canvas.hud?.poiTp?.close?.();
	}
}



/* ──────────────────────────────────────────────────────────────────────
 *  HUD — Context menu for POI notes (Foundry v13+)
 * ──────────────────────────────────────────────────────────────────── */

const { HandlebarsApplicationMixin } = foundry.applications.api;

class PoiTpHUD extends HandlebarsApplicationMixin(foundry.applications.hud.BasePlaceableHUD) {

	static DEFAULT_OPTIONS = {
		id: "poi-tp-ctx-menu",
		classes: ["poi-tp-ctx-menu"],
		actions: {
			executeOption: PoiTpHUD.executeOption
		}
	}

	static PARTS = {
		form: {
			template: "modules/poi-teleport/templates/poi-hud.html"
		}
	}

	/**
	 * ApplicationV2 action handler for menu option clicks.
	 * Reads the trigger method name from data-trigger attribute.
	 */
	static executeOption(event, target) {
		const trigger = target?.dataset?.trigger;
		if (!trigger) return;
		if (target?.classList?.contains("disabled")) {
			ui.notifications?.warn(game.i18n.localize("poitp.destinationNotInWorld"));
			return;
		}
		this.poitp?.[trigger]?.(event);
	}

	/**
	 * Binds a PointOfInterestTeleporter to the HUD.
	 *
	 * @override
	 * @param {PointOfInterestTeleporter} poitp
	 */
	bind(poitp) {
		this.poitp = poitp;
		super.bind(poitp.note);
	}

	/**
	 * Prepare context data for the Handlebars template.
	 *
	 * @override
	 * @return {Promise<object>}
	 */
	async _prepareContext() {
		let context = {};
		try {
			if (super._prepareContext) context = await super._prepareContext();
		} catch (e) { /* ignore */ }
		context.options = this.poitp?.getOptions() ?? [];
		return context;
	}

	/**
	 * Set the position of the HUD to match the map note position.
	 *
	 * @override
	 */
	setPosition() {
		const el = this.element;
		if (!el) return;
		const obj = this.object;
		// Foundry calls setPosition on every window resize for all registered HUD
		// apps, even after the bound note has been torn down (scene change / canvas
		// teardown). A destroyed PIXI placeable has a null transform, so reading
		// .x/.y throws "Cannot read properties of null (reading 'position')". Bail.
		if (!obj || obj.destroyed || !obj.transform) return;
		el.style.left = obj.x + "px";
		el.style.top = obj.y + "px";
	}
}


/* ────────────────────────────────────────────────────────────────────
 *  Hook registrations
 * ──────────────────────────────────────────────────────────────────── */

Hooks.on("getSceneDirectoryEntryContext", (...args) => PointOfInterestTeleporter.getSceneDirEnCtx(...args));

Hooks.on("renderHeadsUpDisplayContainer", (...args) => PointOfInterestTeleporter.renderHeadsUpDisplay(...args));

Hooks.on("canvasReady", () => PointOfInterestTeleporter.onReady());
Hooks.on("createNote", (...args) => PointOfInterestTeleporter.createNote(...args));
Hooks.on("updateNote", (...args) => PointOfInterestTeleporter.updateNote(...args));
