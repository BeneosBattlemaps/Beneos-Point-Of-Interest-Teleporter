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
	 * Resolve the parent JournalEntry a note reference points at, regardless of
	 * whether the note references the whole entry or a single page.
	 *
	 * @param {string|null} entryId
	 * @param {string|null} pageId
	 * @return {JournalEntry|null}
	 * @memberof PointOfInterestTeleporter
	 */
	static resolveNoteJournal(entryId, pageId) {
		if (entryId) return game.journal?.get(entryId) ?? null;
		if (pageId) return this.journalByPage().get(pageId) ?? null;
		return null;
	}

	/**
	 * Lookup tables for the two world-wide searches this module used to run once
	 * per map note.
	 *
	 * onReady checks every note on the scene at every canvasReady, and each check
	 * scanned all of game.scenes to find the destination, plus all of game.journal
	 * when the note targets a page rather than an entry. Measured in a world with
	 * 2124 scenes: 1.38 ms per scan, so the busiest note scene (82 notes) paid
	 * about 113 ms on every scene load, and that grows with the world.
	 *
	 * Both tables are built on first use and thrown away whenever the documents
	 * they summarise change, so they cannot go stale.
	 *
	 * @memberof PointOfInterestTeleporter
	 */
	static _scenesByJournalCache = null;
	static _journalByPageCache = null;

	/** @return {Map<string, Scene[]>} scenes keyed by the journal entry assigned to them */
	static scenesByJournal() {
		if (this._scenesByJournalCache) return this._scenesByJournalCache;
		const map = new Map();
		// Built in collection order so callers that take the first match keep
		// picking the same scene as the previous game.scenes.filter did.
		for (const scene of game.scenes ?? []) {
			const id = scene.journal?.id;
			if (!id) continue;
			const bucket = map.get(id);
			if (bucket) bucket.push(scene);
			else map.set(id, [scene]);
		}
		this._scenesByJournalCache = map;
		return map;
	}

	/**
	 * @return {Map<string, JournalEntry>} the parent entry of every journal page
	 *
	 * First writer wins, deliberately. Page ids are not reliably unique across a
	 * world: cloned and re-imported journals share them, and this world has 91
	 * page ids owned by more than one entry, one of them by 72. The loop this
	 * replaces returned the first entry in game.journal order that contained the
	 * page, so keeping the first match is what keeps existing pins resolving to
	 * the same journal they resolved to before.
	 */
	static journalByPage() {
		if (this._journalByPageCache) return this._journalByPageCache;
		const map = new Map();
		for (const entry of game.journal ?? []) {
			for (const page of entry.pages ?? []) {
				if (!map.has(page.id)) map.set(page.id, entry);
			}
		}
		this._journalByPageCache = map;
		return map;
	}

	static invalidateSceneLookup() { this._scenesByJournalCache = null; }
	static invalidateJournalLookup() { this._journalByPageCache = null; }

	/**
	 * Resolve the destination scene for a note reference. Shared by checkNote()
	 * and _lookupScene() so both paths stay in sync.
	 *
	 * The rule is deliberately simple: a scene that is assigned this journal
	 * entry IS the installed destination. Whether the scene links the whole
	 * entry or a single page does not matter, because scene.journal always
	 * resolves to the parent JournalEntry (page-linked scenes keep it set too).
	 * If no scene is assigned the journal, the destination is not installed and
	 * the caller shows the install hint (release number parsed from the journal
	 * name). We intentionally do NOT inspect the scene's background or content:
	 * a scene document existing in the world means it is navigable.
	 *
	 * @param {JournalEntry|null} journal  resolved parent entry of the note ref
	 * @param {string|null} pageId         specific page id the note targets (opt)
	 * @return {Scene|null}
	 * @memberof PointOfInterestTeleporter
	 */
	static resolveDestinationScene(journal, pageId) {
		if (!journal) return null;

		// Every scene assigned this journal entry (page-linked scenes included,
		// since scene.journal resolves to the parent entry).
		const matches = this.scenesByJournal().get(journal.id);
		if (!matches?.length) return null;

		// When the note targets a specific page and several scenes share the
		// entry, prefer the scene linked to that exact page. scene.journalEntryPage
		// is the raw page-id string in every Foundry version.
		if (pageId) {
			const exact = matches.find(s => s.journalEntryPage === pageId);
			if (exact) return exact;
		}
		return matches[0];
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
			journal = PointOfInterestTeleporter.journalByPage().get(notePageId) ?? null;
		}

		// Journal missing → only attach POI behaviour when the note is explicitly
		// flagged as a Beneos teleporter. Orphaned references on user-owned notes
		// (journal was deleted, or never resolved) are treated as non-POI content
		// and left to Foundry's default behaviour.
		if (!journal) {
			// Journal genuinely missing (rare now that destination journals ship
			// in every pack). The note label is the only name left, and it is not
			// conclusive, so ask the Beneos index about the id as well. A document
			// id from a third-party world is never in that index, which is what
			// keeps this harmless in worlds that are not ours.
			const binding = PointOfInterestTeleporter.parseBinding(noteDoc.text);
			let indexKind = "";
			if (!binding.isBeneos && hasEntryId && PointOfInterestTeleporter.hasBeneosIndex()) {
				try {
					indexKind = await game.beneos.api.classifyBeneosJournal(noteEntryId) ?? "";
				} catch (_e) { /* index unavailable: fall back to the label */ }
			}
			if (!binding.isBeneos && !indexKind) return;

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
			} else if (indexKind === "content") {
				missingContentType = "generic";
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

		// Regular POI → look up the target scene via the shared resolver.
		// A scene assigned this journal (the note's already-resolved parent entry)
		// is the installed destination; no scene assigned → missing destination.
		const scene = this.resolveDestinationScene(journal, hasPageId ? notePageId : null);

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
	async _contextMenu(event) {
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

		// Resolve the destination release before the menu is built, so the first
		// render already shows the release name instead of flashing a placeholder.
		// The index is loaded once per session and cached in memory, so every call
		// after the first is a map lookup.
		if (!this.scene && !this.contentType) await this._resolveTarget();

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
			const entry = PointOfInterestTeleporter.journalByPage().get(pageId);
			const page = entry?.pages?.get?.(pageId);
			if (page) return `${entry.name} / ${page.name}`;
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
			releaseToken: parsed?.releaseToken ?? null,
			mapHint: parsed?.mapHint ?? null,
			typeHint: parsed?.typeHint ?? null,
			name: name ?? null
		};
	}

	/**
	 * Whether the Beneos index API is available in this world.
	 *
	 * This is the hard boundary for third-party worlds. Without the Beneos module
	 * there is no index, no lookup, no install offer and no cloud request: POI
	 * behaves like any generic teleporter module and a missing destination simply
	 * says so. Nothing below this gate may run for somebody else's content.
	 *
	 * @return {boolean}
	 * @memberof PointOfInterestTeleporter
	 */
	static hasBeneosIndex() {
		if (!game.modules?.get?.("beneos-module")?.active) return false;
		const api = game.beneos?.api;
		if (!api) return false;
		if (!(Number(api.capabilities?.poiIndex) >= 1)) return false;
		return typeof api.resolveReleaseForJournal === "function";
	}

	/**
	 * Ask the Beneos module which release provides this note's destination.
	 * Cached per teleporter instance: the answer only changes after an install,
	 * and that path refreshes it explicitly.
	 *
	 * @return {Promise<object|null>} resolution, or null when unavailable
	 * @memberof PointOfInterestTeleporter
	 */
	async _resolveTarget() {
		if (this._resolution !== undefined) return this._resolution;
		this._resolution = null;
		if (!PointOfInterestTeleporter.hasBeneosIndex()) return null;

		const doc = this.note?.document;
		const entryId = (doc?.entryId && doc.entryId.trim() !== "") ? doc.entryId : null;
		const b = this._resolveBeneosBinding();

		try {
			this._resolution = await game.beneos.api.resolveReleaseForJournal(entryId, {
				journalName: b.name,
				releaseToken: b.releaseToken,
				releaseHint: b.releaseHint
			}) ?? null;
		} catch (err) {
			console.warn("poi-teleport | resolveReleaseForJournal failed", err);
			this._resolution = null;
		}
		return this._resolution;
	}

	/**
	 * Is this note a Beneos teleporter?
	 *
	 * The journal name is only conclusive while the journal document is in the
	 * world. When it is not, the index decides: a document id from a foreign
	 * world is never in it, so this can not misfire on third-party content.
	 *
	 * @return {boolean}
	 * @memberof PointOfInterestTeleporter
	 */
	_isBeneosTarget() {
		if (this._resolveBeneosBinding().isBeneos) return true;
		return this._resolution?.kind === "teleport";
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
		if (!b.isBeneos && !this._isBeneosTarget()) {
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
		if (!this._isBeneosTarget()) return false;
		if (!game.modules?.get?.("beneos-module")?.active) return false;
		if (typeof game.beneos?.api?.installReleaseForTarget === "function") return true;
		return typeof game.beneos?.api?.installReleaseByNumber === "function";
	}

	/**
	 * Does the Beneos module answer "is THIS destination installed", rather than
	 * only "does the registry know this release"?
	 *
	 * Capability 2 adds the destination's scene id and the graded verdict to the
	 * resolution. Against a version-1 module those fields are simply absent, and
	 * absent would read as "not recorded" in every test below. That is the exact
	 * false accusation this gate exists to prevent, so the old single-sentence
	 * behaviour stays in place until the module can back the new one up.
	 *
	 * @return {boolean}
	 * @memberof PointOfInterestTeleporter
	 */
	static hasInstallVerdict() {
		return Number(game.beneos?.api?.capabilities?.poiIndex) >= 2;
	}

	/**
	 * Why is a release present and its destination still missing?
	 *
	 * Until 14.2.x there was one answer for all of them: "installed, but it
	 * contains no scene for this destination. Please report this to Beneos."
	 * Three of the four readings below are not a packaging defect at all, and
	 * customers were being sent to file reports that were not reports.
	 *
	 *   unlinked     the scene document IS in the world, it just carries no link
	 *                to this pin. The only reading that is ours to fix.
	 *   partial      the install never brought this scene. A scene-scoped install
	 *                writes the whole release dir with a single scene id, and its
	 *                dependency closure pulls in the pins' JOURNALS without their
	 *                target scenes. A stopped or skipped bundle run does the same.
	 *   removed      the install brought it and it is gone since. The user's own
	 *                deletion, not a defect.
	 *   undecidable  the index is too old to name a scene id. Nothing beyond
	 *                "not in your world" is provable, so nothing else is claimed.
	 *
	 * @param {object} r resolution from the Beneos module
	 * @return {"unlinked"|"partial"|"removed"|"undecidable"}
	 * @memberof PointOfInterestTeleporter
	 */
	static installVerdict(r) {
		if (r?.destinationInWorld === true) return "unlinked";
		if (r?.destinationRecorded === false) return "partial";
		if (r?.destinationRecorded === true) return "removed";
		return "undecidable";
	}

	/**
	 * The rows that explain why a release we already have still shows no
	 * destination, plus whether they end the menu.
	 *
	 * `final: true` means no install is worth offering: either the module is too
	 * old to say more than the old single sentence, or the scene is demonstrably
	 * in the world and downloading it again would change nothing.
	 *
	 * @param {object} r resolution
	 * @param {function(string): object} infoRow row factory of the caller
	 * @return {{rows: ContextMenuOption[], final: boolean}}
	 * @memberof PointOfInterestTeleporter
	 */
	_installedButMissingRows(r, infoRow) {
		if (!PointOfInterestTeleporter.hasInstallVerdict()) {
			// Module too old to tell the cases apart: unchanged behaviour.
			return { rows: [infoRow(game.i18n.format("poitp.installNoDestination", { title: r.title }))], final: true };
		}

		const scene = r.sceneName || "";
		switch (PointOfInterestTeleporter.installVerdict(r)) {
			case "unlinked":
				return { rows: [infoRow(game.i18n.format("poitp.destSceneUnlinked", { scene }))], final: true };
			case "partial":
				return { rows: [infoRow(game.i18n.format("poitp.destInstalledPartial", { title: r.title }))], final: false };
			case "removed":
				return { rows: [infoRow(game.i18n.format("poitp.destInstalledRemoved", { scene }))], final: false };
			default:
				// "undecidable" adds no sentence on purpose: the error row above
				// already says the destination is not here, and nothing further is
				// provable. The install offer is the useful part either way.
				return { rows: [], final: false };
		}
	}

	/**
	 * Build the menu rows for a missing destination.
	 *
	 * Three states, and the difference between them is what the module actually
	 * knows rather than what it can guess:
	 *
	 *   A  the index resolved the destination  -> name the release and offer it
	 *   B  as A, but several releases provide it -> add a "choose" entry
	 *   C  nothing verified                    -> say so, show the unverified
	 *      number hint for information only, and offer the cloud browser
	 *
	 * The number parsed from the journal name is never used to start a download.
	 * It is a label, and in state C it is explicitly marked as unverified.
	 *
	 * Inside state A the release may already be present. That used to end the
	 * menu with a request to report a bug; it now splits by installVerdict() and
	 * keeps the install offer alive, because reinstalling is what actually fixes
	 * the two ordinary cases.
	 *
	 * @return {ContextMenuOption[]}
	 * @memberof PointOfInterestTeleporter
	 */
	_missingDestinationOptions() {
		const infoRow = (title) => ({ icon: "", title, rawTitle: true, disabled: true, info: true });
		const r = this._resolution;

		// No index available (no Beneos module, or an older build): exactly the
		// previous behaviour, message and all.
		if (!r) {
			const items = [{
				icon: '<i class="fas fa-exclamation-triangle fa-fw"></i>',
				title: this.getReleaseMessage(),
				rawTitle: true,
				disabled: true,
				error: true
			}];
			if (this._canInstallMissingPack()) {
				items.push({
					icon: '<i class="fas fa-cloud-download-alt fa-fw"></i>',
					title: "poitp.installMissingPack",
					trigger: "installMissingPack"
				});
			}
			return items;
		}

		// A content journal is not a destination at all. It never gets a download
		// offer, however much its name may look like a release.
		if (r.kind === "content") {
			return [infoRow(game.i18n.localize("poitp.contentType.generic"))];
		}

		const items = [{
			icon: '<i class="fas fa-exclamation-triangle fa-fw"></i>',
			title: game.i18n.localize("poitp.destinationNotInWorld"),
			rawTitle: true,
			disabled: true,
			error: true
		}];

		if (r.found && r.title) {
			// --- state A / B: we know the release that ships the destination.
			items.push(infoRow(r.label
				? game.i18n.format("poitp.destReleaseLine", { title: r.title, label: r.label })
				: game.i18n.format("poitp.destReleaseLineNoNum", { title: r.title })));

			if (r.sceneName) items.push(infoRow(game.i18n.format("poitp.destSceneLine", { scene: r.sceneName })));

			// Release already present but still no destination scene. Why decides
			// both what we say and whether an install is worth offering.
			if (r.installed) {
				const said = this._installedButMissingRows(r, infoRow);
				items.push(...said.rows);
				if (said.final) return items;
			}

			if (r.ambiguous) {
				items.push(infoRow(game.i18n.format("poitp.destAlsoIn", { count: Math.max(0, r.candidates.length - 1) })));
			}

			if (this._canInstallMissingPack()) {
				items.push({
					icon: '<i class="fas fa-cloud-download-alt fa-fw"></i>',
					title: game.i18n.format("poitp.installNamedRelease", { title: r.title }),
					rawTitle: true,
					trigger: "installMissingPack"
				});
			}
			return items;
		}

		// --- state C: nothing verified.
		items.push(infoRow(game.i18n.localize("poitp.destUnknownRelease")));

		const b = this._resolveBeneosBinding();
		const hint = b.releaseToken ?? (b.releaseHint != null ? String(b.releaseHint) : null);
		if (hint) items.push(infoRow(game.i18n.format("poitp.destNumberHintOnly", { release: hint })));

		if (game.user?.isGM && game.modules?.get?.("beneos-module")?.active) {
			items.push({
				icon: '<i class="fas fa-cloud fa-fw"></i>',
				title: "poitp.browseCloud",
				trigger: "browseCloud"
			});
		}
		return items;
	}

	/**
	 * Open the Beneos cloud browser so the user can look for the release
	 * themselves. Used when the index could not verify a destination, in place of
	 * the old fuzzy name match that would silently download an unrelated pack.
	 *
	 * @memberof PointOfInterestTeleporter
	 */
	browseCloud() {
		canvas.hud?.poiTp?.close?.();
		const install = game.beneos?.api?.installReleaseForTarget;
		if (typeof install !== "function") {
			return ui.notifications?.warn(game.i18n.localize("poitp.installApiMissing"));
		}
		// Resolution already failed, so this call falls straight through to the
		// browser without proposing anything.
		Promise.resolve(install({ journalId: null, journalName: null }))
			.catch(err => console.warn("poi-teleport | browseCloud failed", err));
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

		const b = this._resolveBeneosBinding();
		const doc = this.note?.document;
		const journalId = (doc?.entryId && doc.entryId.trim() !== "") ? doc.entryId : null;

		// The API promise resolves only AFTER the native installer has created the
		// scene documents, so we can re-resolve our destination immediately and
		// flip this teleporter to "navigation" without a reload.
		let call;
		if (typeof game.beneos?.api?.installReleaseForTarget === "function") {
			// Preferred path: hand over the journal id, which is the only stable key.
			call = game.beneos.api.installReleaseForTarget({
				journalId,
				journalName: b.name,
				releaseToken: b.releaseToken,
				releaseHint: b.releaseHint,
				mapHint: b.mapHint,
				typeHint: b.typeHint
			});
		} else if (typeof game.beneos?.api?.installReleaseByNumber === "function") {
			// Older beneos-module in the field. Still pass the journal id: builds
			// that understand it resolve properly, older ones just ignore it.
			let releaseNum;
			if (b.hintKind === "release" && b.releaseHint != null) releaseNum = b.releaseHint;
			call = game.beneos.api.installReleaseByNumber(releaseNum, {
				journalId, mapHint: b.mapHint, typeHint: b.typeHint, name: b.name
			});
		} else {
			return ui.notifications?.warn(game.i18n.localize("poitp.installApiMissing"));
		}

		Promise.resolve(call)
			.then(result => this._refreshDestinationAfterInstall(result))
			.catch(err => {
				console.warn("poi-teleport | installMissingPack failed", err);
				ui.notifications?.error(game.i18n.localize("poitp.installApiMissing"));
			});
	}

	/**
	 * Resolve the destination scene this note points at, using the same simple
	 * rule as checkNote(): a scene assigned the note's journal is the installed
	 * destination; no such scene means the destination is not installed.
	 *
	 * @return {Scene|null}
	 * @memberof PointOfInterestTeleporter
	 */
	_lookupScene() {
		const doc = this.note?.document;
		if (!doc) return null;
		const pageId = (doc.pageId && doc.pageId.trim() !== "") ? doc.pageId : null;
		const entryId = (doc.entryId && doc.entryId.trim() !== "") ? doc.entryId : null;

		const journal = PointOfInterestTeleporter.resolveNoteJournal(entryId, pageId);
		if (!journal) return null;

		return PointOfInterestTeleporter.resolveDestinationScene(journal, pageId);
	}

	/**
	 * After a triggered install completes, re-resolve the destination. If the
	 * release's real scene now exists, flip this teleporter from "missing" to
	 * "navigation" so the next right-click travels there directly (no reload).
	 * A no-op when nothing was installed (cancelled / no access / failed).
	 *
	 * @memberof PointOfInterestTeleporter
	 */
	async _refreshDestinationAfterInstall(result) {
		// Drop the cached resolution: the world changed under us.
		this._resolution = undefined;

		const scene = this._lookupScene();
		if (scene) {
			this.scene = scene;
			this.contentType = null;
			ui.notifications?.info(game.i18n.format("poitp.installReadyNotice", { name: scene.name }));
			return;
		}

		// Nothing was installed (cancelled, no access, browser opened): silence is
		// the right answer, the user made that choice.
		if (result && result.status !== "installed") return;

		// Installed, and still no destination. Previously this returned silently,
		// which is the worst possible outcome: the user has just downloaded
		// gigabytes and gets no feedback at all. Say what happened.
		//
		// But "installed" here is weaker than it looks: installReleaseForTarget
		// reports it as soon as the native install run RETURNS, and that run
		// aborts cleanly when the user declines the overwrite confirmation. The
		// resolution handed in is also older than the install. So re-ask, and let
		// the fresh verdict decide whether this is our defect or the user's own
		// choice not to overwrite.
		const fresh = PointOfInterestTeleporter.hasInstallVerdict() ? await this._resolveTarget() : null;
		if (fresh && PointOfInterestTeleporter.installVerdict(fresh) === "partial") {
			// The run brought nothing for this destination. Not a defect, so no
			// request to report it. But not silence either: staying quiet after a
			// download is the failure mode 14.2.0 was written to end, and only the
			// declined overwrite prompt is self-explanatory. A cut-short or skipped
			// run leaves the user with no idea why the pin still does not work.
			ui.notifications?.info(game.i18n.format("poitp.destInstalledPartial", { title: fresh.title || "" }));
			return;
		}

		const title = result?.title || result?.releaseDir || this._resolveBeneosBinding().name || "";
		console.warn("poi-teleport | install produced no destination", {
			journalId: this.note?.document?.entryId ?? null,
			journalName: this._resolveBeneosBinding().name ?? null,
			releaseDir: result?.releaseDir ?? null,
			resolvedBy: result?.resolvedBy ?? null,
			indexVersion: result?.indexVersion ?? null,
			sceneId: fresh?.sceneId ?? result?.sceneId ?? null,
			destinationRecorded: fresh?.destinationRecorded ?? null,
			destinationInWorld: fresh?.destinationInWorld ?? null,
			installedSceneCount: fresh?.installedSceneCount ?? null,
			releaseSceneCount: fresh?.releaseSceneCount ?? null
		});

		// The scene document arrived but carries no link to this pin: name the
		// scene, because that is the detail a report needs.
		if (fresh && PointOfInterestTeleporter.installVerdict(fresh) === "unlinked") {
			ui.notifications?.warn(game.i18n.format("poitp.destSceneUnlinked", { scene: fresh.sceneName || "" }));
			return;
		}
		ui.notifications?.warn(game.i18n.format("poitp.installNoDestination", { title }));
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

		// Missing destination → named release plus a one-click install when the
		// index could verify it, an honest "unknown" otherwise. Config access is
		// intentionally not offered here: GMs reach the note configuration via
		// double-right-click on the icon.
		if (!this.scene) return this._missingDestinationOptions();

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

// Drop the lookup tables whenever the documents they summarise change. A page's
// parent entry is the only thing the journal table depends on, so that one is
// invalidated on its own and each rebuild stays cheap.
Hooks.on("createScene", () => PointOfInterestTeleporter.invalidateSceneLookup());
Hooks.on("updateScene", () => PointOfInterestTeleporter.invalidateSceneLookup());
Hooks.on("deleteScene", () => PointOfInterestTeleporter.invalidateSceneLookup());
// The scene table keys on scene.journal?.id, and that getter resolves to null for
// as long as the JournalEntry document is absent from the world. An install
// creates Scene documents BEFORE JournalEntry documents, so a table built inside
// that window silently omits every scene whose journal had not arrived yet, and
// its teleporters report "destination not in your world" until the next reload.
// Journal creation therefore invalidates the scene table as well.
Hooks.on("createJournalEntry", () => {
	PointOfInterestTeleporter.invalidateJournalLookup();
	PointOfInterestTeleporter.invalidateSceneLookup();
});
Hooks.on("updateJournalEntry", () => PointOfInterestTeleporter.invalidateJournalLookup());
Hooks.on("deleteJournalEntry", () => {
	PointOfInterestTeleporter.invalidateJournalLookup();
	PointOfInterestTeleporter.invalidateSceneLookup();
});
// Pages are embedded, so their create/delete does not surface as a JournalEntry
// update on every path. Watch them directly as well.
Hooks.on("createJournalEntryPage", () => PointOfInterestTeleporter.invalidateJournalLookup());
Hooks.on("deleteJournalEntryPage", () => PointOfInterestTeleporter.invalidateJournalLookup());
