/**
 * POI Teleporter — Audit Tool
 *
 * Adds a Module Settings button to scan all scenes for POI notes and report:
 * - MISSING targets (valid ref, but journal/page not found)
 * - INVALID targets (no valid ref)
 *
 * Primary target: Foundry V13+, compatible with V12.
 */

class PoiTpAudit {
	static MODULE_ID = "poi-teleport";

	static registerSettings() {
		// Register a menu entry in module settings
		try {
			game.settings.registerMenu(this.MODULE_ID, "auditMenu", {
				name: "poitp.audit.run",
				hint: "poitp.audit.hint",
				label: "poitp.audit.open",
				icon: "fas fa-search",
				type: PoiTpAuditMenu,
				restricted: true
			});

			game.settings.register(this.MODULE_ID, "auditCacheTargetName", {
				name: "poitp.audit.cacheTargetName",
				hint: "poitp.audit.cacheTargetNameHint",
				scope: "world",
				config: true,
				type: Boolean,
				default: true
			});
		} catch (e) {
			console.warn("POI Teleport | Failed to register audit settings", e);
		}
	}

	/**
	 * Scan all scenes for note targets.
	 * Processes scenes in batches of 25 and yields to the event loop
	 * to prevent freezing on worlds with 1000+ scenes.
	 *
	 * @param {(progress:{done:number,total:number})=>void} onProgress
	 */
	static async scanWorld({ onProgress } = {}) {
		const records = [];
		const scenes = Array.from(game.scenes ?? []);
		const total = scenes.length;

		const batchSize = 25;
		let done = 0;

		for (let i = 0; i < scenes.length; i += batchSize) {
			const batch = scenes.slice(i, i + batchSize);
			for (const scene of batch) {
				records.push(...await this.scanScene(scene));
				done++;
			}
			onProgress?.({ done, total });
			// Yield to event loop to avoid freezing
			await new Promise(r => setTimeout(r, 0));
		}

		return records;
	}

	/**
	 * Extract the target reference from a note document.
	 * Works across Foundry v12 and v13 API differences.
	 */
	static getNoteTargetRef(noteDoc) {
		const pageId = noteDoc?.pageId ?? noteDoc?.document?.pageId ?? noteDoc?.page?.id ?? noteDoc?.document?.page?.id;
		const entryId = noteDoc?.entryId ?? noteDoc?.document?.entryId ?? noteDoc?.entry?.id ?? noteDoc?.document?.entry?.id;

		if (pageId != null) return { type: "page", id: pageId };
		if (entryId != null) return { type: "entry", id: entryId };
		return { type: "none", id: null };
	}

	/**
	 * Attempt to resolve a target reference to a journal entry/page.
	 */
	static resolveTarget(ref) {
		if (ref.type === "entry") {
			const entry = game.journal?.get(ref.id);
			if (entry) return { status: "OK", name: entry.name, entry, page: null };
			return { status: "MISSING", name: null, entry: null, page: null };
		}

		if (ref.type === "page") {
			for (const entry of game.journal ?? []) {
				const pages = entry.pages;
				const page = pages?.get?.(ref.id);
				if (page) {
					const name = `${entry.name} / ${page.name}`;
					return { status: "OK", name, entry, page };
				}
			}
			return { status: "MISSING", name: null, entry: null, page: null };
		}

		return { status: "INVALID", name: null, entry: null, page: null };
	}

	/**
	 * Parse release hint from a target name.
	 * Detects DontTouch-POI-Teleporter-XX, Escalia, and DiA patterns.
	 */
	static parseReleaseHint(nameCandidate) {
		if (!nameCandidate || typeof nameCandidate !== "string") return { hintKind: "none" };

		// Exceptions
		if (nameCandidate.startsWith("DontTouch_DiA_Map_")) {
			return { hintKind: "dia96", releaseHint: 96 };
		}
		if (nameCandidate.startsWith("DontTouch-POI-Teleporter-Escalia-Mia")) {
			return { hintKind: "escalia" };
		}

		const m = nameCandidate.match(/^DontTouch-POI-Teleporter-(\d+)/);
		if (m) {
			const n = parseInt(m[1], 10);
			if (!Number.isNaN(n)) return { hintKind: "release", releaseHint: n };
		}
		return { hintKind: "none" };
	}

	/**
	 * Get the best available name for display.
	 */
	static getBestEffortName({ resolvedName, cachedTargetName, noteText }) {
		return resolvedName || cachedTargetName || noteText || null;
	}

	/**
	 * Scan a single scene for broken POI links.
	 */
	static async scanScene(scene) {
		const out = [];
		const notes = scene?.notes?.contents ?? [];
		const shouldCache = game.settings?.get?.(this.MODULE_ID, "auditCacheTargetName");

		for (const note of notes) {
			const ref = this.getNoteTargetRef(note);
			const cached = note?.flags?.[this.MODULE_ID]?.targetName;
			const noteText = note?.text;

			const resolved = this.resolveTarget(ref);
			const resolvedStatus = resolved.status === "OK" ? "OK" : (ref.type === "none" ? "INVALID" : resolved.status);

			// Skip OK notes (audit focuses on problems)
			if (resolvedStatus === "OK") {
				// Optional: cache target name for future missing scenarios
				if (shouldCache) {
					try {
						const nameToCache = resolved.name;
						const hint = this.parseReleaseHint(nameToCache);
						await note.update({
							flags: {
								...note.flags,
								[this.MODULE_ID]: {
									...(note.flags?.[this.MODULE_ID] ?? {}),
									targetName: nameToCache,
									releaseHint: hint.releaseHint,
									hintKind: hint.hintKind
								}
							}
						});
					} catch (e) {
						// Non-fatal
					}
				}
				continue;
			}

			const bestNameCandidate = this.getBestEffortName({
				resolvedName: resolved.name,
				cachedTargetName: cached,
				noteText
			});

			const hint = this.parseReleaseHint(bestNameCandidate);
			let message = null;
			if (resolvedStatus === "MISSING") {
				if (hint.hintKind === "release" || hint.hintKind === "dia96") {
					message = game.i18n.format("poitp.destinationInstallRelease", { release: hint.releaseHint });
				} else if (hint.hintKind === "escalia") {
					message = game.i18n.localize("poitp.destinationInstallEscalia");
				} else {
					message = game.i18n.localize("poitp.destinationNotInWorld");
				}
			} else if (resolvedStatus === "INVALID") {
				message = game.i18n.localize("poitp.audit.invalidTarget");
			}

			out.push({
				sourceSceneId: scene.id,
				sourceSceneName: scene.name,
				noteId: note.id,
				x: note.x,
				y: note.y,
				noteText: noteText ?? null,

				intendedTargetType: ref.type,
				intendedTargetId: ref.id,

				resolvedStatus,
				resolvedTargetName: resolved.name ?? null,
				cachedTargetName: cached ?? null,
				displayTargetName: bestNameCandidate,

				releaseHint: hint.releaseHint ?? null,
				hintKind: hint.hintKind,
				message
			});
		}

		return out;
	}

	/**
	 * Navigate to the source scene and highlight the note.
	 */
	static async goToSource(rec) {
		const scene = game.scenes?.get(rec.sourceSceneId);
		if (!scene) return;
		await scene.view();

		const pan = async () => {
			try {
				canvas?.animatePan?.({ x: rec.x, y: rec.y, scale: Math.max(canvas.stage.scale.x, 1.0) });
				canvas?.pings?.ping?.({ x: rec.x, y: rec.y });
			} catch (e) {}
		};

		if (canvas?.scene?.id === scene.id) {
			await new Promise(r => requestAnimationFrame(r));
			return pan();
		}

		Hooks.once("canvasReady", () => pan());
	}
}

/**
 * Settings menu wrapper.
 * Foundry expects a FormApplication for registerMenu.
 */
class PoiTpAuditMenu extends FormApplication {
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "poitp-audit-menu",
			title: game.i18n.localize("poitp.audit.title"),
			template: "modules/poi-teleport/templates/poi-audit-menu.html",
			width: 520,
			height: "auto"
		});
	}

	getData() {
		return {
			hint: game.i18n.localize("poitp.audit.hint")
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find("button[data-action='open-audit']").on("click", () => {
			new PoiTpAuditApp().render(true);
		});
	}

	async _updateObject(_event, _formData) {
		// no-op
	}
}

/**
 * The audit application window.
 * Displays scan results in a table with go-to and copy actions.
 */
class PoiTpAuditApp extends Application {
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "poitp-audit-app",
			title: game.i18n.localize("poitp.audit.title"),
			template: "modules/poi-teleport/templates/poi-audit.html",
			width: 920,
			height: 600,
			resizable: true
		});
	}

	constructor(...args) {
		super(...args);
		this.records = [];
		this.progress = { done: 0, total: 0 };
		this.scanning = false;
	}

	getData() {
		return {
			records: this.records,
			progress: this.progress,
			scanning: this.scanning
		};
	}

	activateListeners(html) {
		super.activateListeners(html);

		html.find("button[data-action='run']").on("click", async () => {
			this.scanning = true;
			this.records = [];
			this.progress = { done: 0, total: 0 };
			this.render();

			const records = await PoiTpAudit.scanWorld({
				onProgress: (p) => {
					this.progress = p;
					this.render(false);
				}
			});
			this.records = records;
			this.scanning = false;
			this.render();
		});

		html.find("button[data-action='goto']").on("click", async (ev) => {
			const idx = Number(ev.currentTarget.dataset.index);
			const rec = this.records[idx];
			if (!rec) return;
			await PoiTpAudit.goToSource(rec);
		});

		html.find("button[data-action='copy']").on("click", async (ev) => {
			const idx = Number(ev.currentTarget.dataset.index);
			const rec = this.records[idx];
			if (!rec) return;
			const text = `${rec.sourceSceneName} → ${rec.displayTargetName ?? rec.intendedTargetId ?? '???'} (${rec.resolvedStatus})`;
			await navigator.clipboard.writeText(text);
			ui.notifications?.info(game.i18n.localize("poitp.audit.copied"));
		});
	}
}

Hooks.once("init", () => PoiTpAudit.registerSettings());
