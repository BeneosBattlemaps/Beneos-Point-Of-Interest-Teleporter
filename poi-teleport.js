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
	static onReady() {
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
	static createNote(noteDocument) {
		if (noteDocument.object) return this.checkNote(noteDocument.object);
	}

	/**
	 * Handles updateNote Hook.
	 *
	 * @static
	 * @param {NoteDocument} noteDocument - The document associated with the new note
	 * @memberof PointOfInterestTeleporter
	 */
	static updateNote(noteDocument) {
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

		// Journal missing → detect content type from note text, or show error menu
		if (!journal) {
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

		if (hasPageId) {
			// Scene.journalEntryPage is always the raw pageId string
			scene = game.scenes.find(s => s.journalEntryPage === notePageId);
		} else if (hasEntryId) {
			// Scene.journal is a resolved JournalEntry document (compare via .id)
			scene = game.scenes.find(s => {
				if (s.journalEntryPage) return false;
				return s.journal?.id === noteEntryId;
			});
		}

		// Wait for mouse interaction manager (needed to attach right-click handler)
		if (!await this.waitFor(note, "mouseInteractionManager", 60)) return;

		// scene found → navigation menu; scene null → error menu (missing destination)
		new PointOfInterestTeleporter(note, scene ?? null, null);
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
		// 1. Flags cache (set by the audit tool)
		const cached = this.note?.document?.flags?.[PointOfInterestTeleporter.MODULE_ID]?.targetName;
		if (cached) return cached;

		// 2. Journal name lookup — most reliable source; works when journal exists but scene is missing
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

		// 3. Note text/label — last resort (human-readable label, usually not a release ID)
		return this.note?.document?.text || null;
	}

	/**
	 * Determine the appropriate error message for a missing destination.
	 * Detects release numbers (DontTouch-POI-Teleporter-XX), Escalia, and DiA patterns.
	 *
	 * @return {string} A localized error message
	 * @memberof PointOfInterestTeleporter
	 */
	getReleaseMessage() {
		const name = this._getTargetName();

		// DontTouch-POI-Teleporter-XX pattern → "Install Release XX"
		const match = name?.match(/DontTouch-POI-Teleporter-(\d+)/);
		if (match) {
			return game.i18n.format("poitp.destinationInstallRelease", { release: parseInt(match[1], 10) });
		}

		// Escalia expansion
		if (name?.includes("Escalia")) {
			return game.i18n.localize("poitp.destinationInstallEscalia");
		}

		// DiA maps → Release 96
		if (name?.startsWith("DontTouch-DiA-Map-")) {
			return game.i18n.format("poitp.destinationInstallRelease", { release: 96 });
		}

		// Flags-based hint (from audit cache)
		const flags = this.note?.document?.flags?.[PointOfInterestTeleporter.MODULE_ID];
		if (flags?.hintKind === "release" && flags?.releaseHint) {
			return game.i18n.format("poitp.destinationInstallRelease", { release: flags.releaseHint });
		}
		if (flags?.hintKind === "escalia") {
			return game.i18n.localize("poitp.destinationInstallEscalia");
		}
		if (flags?.hintKind === "dia96") {
			return game.i18n.format("poitp.destinationInstallRelease", { release: 96 });
		}

		// Generic fallback
		return game.i18n.localize("poitp.destinationNotInWorld");
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
			let infoText = "";
			if (this.contentType === "navigation") {
				infoText = "Left click to teleport characters";
			} else if (this.contentType === "handout") {
				infoText = "Double-left-click to open";
			} else if (this.contentType === "lore") {
				infoText = "Double-left-click to open";
			} else if (this.contentType === "documentation") {
				infoText = "Double-left-click to open";
			}
			return [{
				icon: '', // No icon for info text
				title: infoText,
				rawTitle: true,
				disabled: true,
				info: true
			}];
		}

		// Missing destination → disabled error item with release detection
		if (!this.scene) {
			return [{
				icon: '<i class="fas fa-exclamation-triangle fa-fw"></i>',
				title: this.getReleaseMessage(),
				rawTitle: true,
				disabled: true,
				error: true
			}];
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
				},
				{
					icon: '<i class="fas fa-scroll fa-fw"></i>',
					title: "poitp.toggleNav",
					trigger: "toggleNav"
				},
				{
					icon: '<i class="fas fa-cog fa-fw"></i>',
					title: "poitp.configureNote",
					trigger: "configureNote"
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
			template: "modules/poi-teleport/poi-hud.html"
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
		el.style.left = this.object.x + "px";
		el.style.top = this.object.y + "px";
		el.style.fontSize = "50px";
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
