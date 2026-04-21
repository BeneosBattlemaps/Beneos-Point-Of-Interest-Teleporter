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
				default: false
			});

			game.settings.register(this.MODULE_ID, "setupMode", {
				name: "poitp.setupMode.name",
				hint: "poitp.setupMode.hint",
				scope: "world",
				config: true,
				type: Boolean,
				default: false
			});

			game.settings.registerMenu(this.MODULE_ID, "backfillMenu", {
				name: "poitp.backfill.menuName",
				hint: "poitp.backfill.menuHint",
				label: "poitp.backfill.menuLabel",
				icon: "fas fa-tags",
				type: PoiTpBackfillApp,
				restricted: true
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
	 *
	 * Strict Beneos-POI rule: only journal names that follow the
	 * `DontTouch-POI-Teleporter-*` pattern count as Beneos teleporters.
	 * Handouts, Navigation-, Lore-, and Documentation-journals do NOT match
	 * and must not be auto-flagged.
	 *
	 * Returns { hintKind, releaseHint?, mapHint?, typeHint?, isBeneos }
	 */
	static parseReleaseHint(nameCandidate) {
		if (!nameCandidate || typeof nameCandidate !== "string") {
			return { hintKind: "none", isBeneos: false };
		}

		// Escalia expansion (`DontTouch-POI-Teleporter-Escalia-Mia...`)
		if (nameCandidate.startsWith("DontTouch-POI-Teleporter-Escalia-Mia")) {
			return { hintKind: "escalia", isBeneos: true };
		}

		// Regular release pattern: DontTouch-POI-Teleporter-RELEASE(-MAP(-TYPE)?)?
		const m = nameCandidate.match(/^DontTouch-POI-Teleporter-(\d+)(?:-(\d+))?(?:-([A-Z]+))?/);
		if (m) {
			const release = parseInt(m[1], 10);
			if (!Number.isNaN(release)) {
				const out = { hintKind: "release", releaseHint: release, isBeneos: true };
				if (m[2] != null) {
					const map = parseInt(m[2], 10);
					if (!Number.isNaN(map)) out.mapHint = map;
				}
				if (m[3]) out.typeHint = m[3];
				return out;
			}
		}

		return { hintKind: "none", isBeneos: false };
	}

	/**
	 * Get the best available name for display.
	 */
	static getBestEffortName({ resolvedName, cachedTargetName, noteText }) {
		return resolvedName || cachedTargetName || noteText || null;
	}

	/**
	 * Compute the Beneos binding flag object for a given target name.
	 * Returns a fully-populated flag object with nulls for missing fields, so
	 * callers can do a strict equality check against existing flags.
	 */
	static computeBeneosFlags(targetName) {
		const hint = this.parseReleaseHint(targetName);
		return {
			isBeneos: hint.isBeneos === true,
			targetName: targetName ?? null,
			releaseHint: hint.releaseHint ?? null,
			mapHint: hint.mapHint ?? null,
			typeHint: hint.typeHint ?? null,
			hintKind: hint.hintKind ?? "none"
		};
	}

	/**
	 * True if the two Beneos-flag objects carry the same binding info.
	 * Ignores userOverride (tracked separately).
	 */
	static beneosFlagsEqual(a, b) {
		if (!a || !b) return false;
		return a.isBeneos === b.isBeneos
			&& a.targetName === b.targetName
			&& a.releaseHint === b.releaseHint
			&& a.mapHint === b.mapHint
			&& a.typeHint === b.typeHint
			&& a.hintKind === b.hintKind;
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
						const existing = note.flags?.[this.MODULE_ID] ?? {};
						if (existing.userOverride === true) {
							continue;
						}
						const next = this.computeBeneosFlags(resolved.name);
						if (!this.beneosFlagsEqual(existing, next)) {
							await note.update({
								flags: {
									[this.MODULE_ID]: {
										...existing,
										...next
									}
								}
							});
						}
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
	 * Walk every scene in the world, resolve each POI note's target journal,
	 * and — when the name matches the strict Beneos POI-Teleporter pattern —
	 * write/refresh the Beneos binding flags. Intended for one-time
	 * content-preparation runs on the internal Beneos setup world.
	 *
	 * Skips notes with `userOverride === true` (GM explicitly decided).
	 * Uses a no-op compare so repeated runs don't flood the update log.
	 *
	 * @param {(progress:{scene:number,scenesTotal:number,notesScanned:number,updated:number,skippedUserOverride:number})=>void} onProgress
	 * @returns {Promise<{scenesProcessed:number,notesScanned:number,updated:number,skippedUserOverride:number}>}
	 */
	static async backfillBeneosFlagsInWorld({ onProgress } = {}) {
		const scenes = Array.from(game.scenes ?? []);
		const scenesTotal = scenes.length;

		let scene = 0;
		let notesScanned = 0;
		let updated = 0;
		let skippedUserOverride = 0;

		const batchSize = 10;
		for (let i = 0; i < scenes.length; i += batchSize) {
			const batch = scenes.slice(i, i + batchSize);
			for (const s of batch) {
				const notes = s?.notes?.contents ?? [];
				for (const note of notes) {
					notesScanned++;

					const existing = note.flags?.[this.MODULE_ID] ?? {};
					if (existing.userOverride === true) {
						skippedUserOverride++;
						continue;
					}

					const ref = this.getNoteTargetRef(note);
					const resolved = this.resolveTarget(ref);
					if (resolved.status !== "OK") continue;

					const hint = this.parseReleaseHint(resolved.name);
					if (!hint.isBeneos) continue;

					const next = this.computeBeneosFlags(resolved.name);
					if (this.beneosFlagsEqual(existing, next)) continue;

					try {
						await note.update({
							flags: {
								[this.MODULE_ID]: { ...existing, ...next }
							}
						});
						updated++;
					} catch (e) {
						// Non-fatal — keep scanning.
					}
				}
				scene++;
			}
			onProgress?.({ scene, scenesTotal, notesScanned, updated, skippedUserOverride });
			await new Promise(r => setTimeout(r, 0));
		}

		return { scenesProcessed: scene, notesScanned, updated, skippedUserOverride };
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
 * Settings menu wrapper (ApplicationV2).
 * Compatible with Foundry v13 and v14.
 */
const { HandlebarsApplicationMixin: AuditHbMixin, ApplicationV2: AuditAppV2 } = foundry.applications.api;

class PoiTpAuditMenu extends AuditHbMixin(AuditAppV2) {
	static DEFAULT_OPTIONS = {
		id: "poitp-audit-menu",
		classes: ["poitp-audit-menu"],
		position: { width: 520, height: "auto" },
		window: {
			title: "poitp.audit.title",
			icon: "fas fa-search"
		},
		actions: {
			openAudit: PoiTpAuditMenu._onOpenAudit
		}
	};

	static PARTS = {
		main: {
			template: "modules/poi-teleport/templates/poi-audit-menu.html"
		}
	};

	async _prepareContext() {
		return {
			hint: game.i18n.localize("poitp.audit.hint")
		};
	}

	static _onOpenAudit() {
		new PoiTpAuditApp().render({ force: true });
	}
}

/**
 * The audit application window (ApplicationV2).
 * Displays scan results in a table with go-to and copy actions.
 * Compatible with Foundry v13 and v14.
 */
class PoiTpAuditApp extends AuditHbMixin(AuditAppV2) {
	static DEFAULT_OPTIONS = {
		id: "poitp-audit-app",
		classes: ["poitp-audit"],
		position: { width: 920, height: 600 },
		window: {
			title: "poitp.audit.title",
			icon: "fas fa-search",
			resizable: true
		},
		actions: {
			run: PoiTpAuditApp._onRun,
			goto: PoiTpAuditApp._onGoto,
			copy: PoiTpAuditApp._onCopy
		}
	};

	static PARTS = {
		main: {
			template: "modules/poi-teleport/templates/poi-audit.html",
			scrollable: [""]
		}
	};

	constructor(...args) {
		super(...args);
		this.records = [];
		this.progress = { done: 0, total: 0 };
		this.scanning = false;
	}

	async _prepareContext() {
		return {
			records: this.records,
			progress: this.progress,
			scanning: this.scanning
		};
	}

	static async _onRun() {
		this.scanning = true;
		this.records = [];
		this.progress = { done: 0, total: 0 };
		this.render({ force: true });

		const records = await PoiTpAudit.scanWorld({
			onProgress: (p) => {
				this.progress = p;
				this.render({ force: false });
			}
		});
		this.records = records;
		this.scanning = false;
		this.render({ force: true });
	}

	static async _onGoto(event, target) {
		const idx = Number(target.dataset.index);
		const rec = this.records[idx];
		if (!rec) return;
		await PoiTpAudit.goToSource(rec);
	}

	static async _onCopy(event, target) {
		const idx = Number(target.dataset.index);
		const rec = this.records[idx];
		if (!rec) return;
		const text = `${rec.sourceSceneName} → ${rec.displayTargetName ?? rec.intendedTargetId ?? '???'} (${rec.resolvedStatus})`;
		await navigator.clipboard.writeText(text);
		ui.notifications?.info(game.i18n.localize("poitp.audit.copied"));
	}
}

/**
 * Backfill application window: weltweit Beneos-Flags auf alle POI-Notes schreiben.
 * Nur im Setup-Mode wirklich nutzbar.
 */
class PoiTpBackfillApp extends AuditHbMixin(AuditAppV2) {
	static DEFAULT_OPTIONS = {
		id: "poitp-backfill-app",
		classes: ["poitp-backfill-app"],
		position: { width: 520, height: "auto" },
		window: {
			title: "poitp.backfill.title",
			icon: "fas fa-tags",
			resizable: false
		},
		actions: {
			runBackfill: PoiTpBackfillApp._onRun
		}
	};

	static PARTS = {
		main: {
			template: "modules/poi-teleport/templates/poi-backfill.html"
		}
	};

	constructor(...args) {
		super(...args);
		this.running = false;
		this.progress = null;
		this.summary = null;
	}

	async _prepareContext() {
		let setupMode = false;
		try {
			setupMode = game.settings.get(PoiTpAudit.MODULE_ID, "setupMode") === true;
		} catch (e) { /* ignore */ }
		return {
			running: this.running,
			progress: this.progress,
			summary: this.summary,
			setupMode
		};
	}

	static async _onRun() {
		const setupMode = game.settings.get(PoiTpAudit.MODULE_ID, "setupMode") === true;
		if (!setupMode) {
			ui.notifications?.warn(game.i18n.localize("poitp.backfill.needSetupMode"));
			return;
		}

		const DialogV2 = foundry.applications?.api?.DialogV2;
		let confirmed = true;
		if (DialogV2?.confirm) {
			confirmed = await DialogV2.confirm({
				window: { title: game.i18n.localize("poitp.backfill.confirmTitle") },
				content: `<p>${game.i18n.localize("poitp.backfill.confirmBody")}</p>`,
				rejectClose: false,
				modal: true
			});
		}
		if (!confirmed) return;

		this.running = true;
		this.summary = null;
		this.progress = { scene: 0, scenesTotal: 0, notesScanned: 0, updated: 0, skippedUserOverride: 0 };
		this.render({ force: true });

		const result = await PoiTpAudit.backfillBeneosFlagsInWorld({
			onProgress: (p) => {
				this.progress = p;
				this.render({ force: false });
			}
		});

		this.running = false;
		this.summary = result;
		this.render({ force: true });

		ui.notifications?.info(
			game.i18n.format("poitp.backfill.doneNotification", {
				updated: result.updated,
				scenes: result.scenesProcessed
			})
		);
	}
}

Hooks.once("init", () => PoiTpAudit.registerSettings());
