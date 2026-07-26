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

		// entryId wins, matching the runtime resolver in poi-teleport.js. The
		// previous order preferred pageId, so audit and runtime could report
		// different targets for one and the same note.
		if (entryId != null) return { type: "entry", id: entryId };
		if (pageId != null) return { type: "page", id: pageId };
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
	 * Returns { hintKind, releaseHint?, releaseToken?, mapHint?, typeHint?, isBeneos }
	 *
	 * `releaseToken` keeps the letter suffix ("57b"); `releaseHint` stays an
	 * integer for backwards compatibility. Neither is used to pick a download any
	 * more, only to label the message: the release itself is resolved from the
	 * journal id against the Beneos index.
	 */
	static parseReleaseHint(nameCandidate) {
		if (!nameCandidate || typeof nameCandidate !== "string") {
			return { hintKind: "none", isBeneos: false };
		}

		// Escalia expansion (bare `DontTouch-POI-Teleporter-Escalia` or the
		// `-Escalia-Mia...` variants). The bare name has no release number.
		if (nameCandidate.startsWith("DontTouch-POI-Teleporter-Escalia")) {
			return { hintKind: "escalia", isBeneos: true };
		}

		// Regular release pattern: DontTouch-POI-Teleporter-RELEASE(-MAP(-TYPE)?)?
		// The optional letter suffix used to be silently dropped, which made every
		// letter release (0020b, 0042c, 0057b, ...) report its base number.
		const m = nameCandidate.match(/^DontTouch-POI-Teleporter-(\d{1,4})([a-z]?)(?:-(\d+))?(?:-([A-Z]+))?/);
		if (m) {
			const release = parseInt(m[1], 10);
			if (!Number.isNaN(release)) {
				const suffix = (m[2] || "").toLowerCase();
				const out = {
					hintKind: "release",
					releaseHint: release,
					releaseToken: `${release}${suffix}`,
					isBeneos: true
				};
				if (m[3] != null) {
					const map = parseInt(m[3], 10);
					if (!Number.isNaN(map)) out.mapHint = map;
				}
				if (m[4]) out.typeHint = m[4];
				return out;
			}
		}

		// Any other Beneos teleporter journal (no resolvable release number).
		// Still a Beneos teleporter, so it must surface the install hint/menu.
		// Content-type journals (handout/navigation/lore/documentation) do NOT
		// carry this prefix and stay non-Beneos.
		if (nameCandidate.startsWith("DontTouch-POI-Teleporter")) {
			return { hintKind: "none", isBeneos: true };
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
	 * Scan a single scene for broken POI links.
	 */
	static async scanScene(scene) {
		const out = [];
		const notes = scene?.notes?.contents ?? [];

		for (const note of notes) {
			const ref = this.getNoteTargetRef(note);
			const noteText = note?.text;

			const resolved = this.resolveTarget(ref);
			const resolvedStatus = resolved.status === "OK" ? "OK" : (ref.type === "none" ? "INVALID" : resolved.status);

			// Skip OK notes (audit focuses on problems)
			if (resolvedStatus === "OK") continue;

			const bestNameCandidate = this.getBestEffortName({
				resolvedName: resolved.name,
				cachedTargetName: null,
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
				cachedTargetName: null,
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

Hooks.once("init", () => PoiTpAudit.registerSettings());
