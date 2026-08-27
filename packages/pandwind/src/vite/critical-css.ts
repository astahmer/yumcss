/**
 * Critical-CSS inlining (plans/014 §2a): per-route stylesheet chunks
 * (common + route-exclusive) written into the matching HTML entry's <head>
 * at build time, so first paint needs zero stylesheet requests.
 *
 * Pure module — no vite imports. The plugin's closeBundle reads the built
 * HTML from disk and delegates here; unit tests call it directly.
 */

const CRITICAL_MARKER_ATTR = "data-pw-critical";

const DEFAULT_CAP_BYTES = 64 * 1024;

export interface RenderCriticalOptions {
	/** The built HTML document text. */
	html: string;
	/** Route name (used for the marker attribute). */
	routeName: string;
	/** Critical payload: common chunk + route-exclusive chunk. */
	css: string;
	/** Maximum injected bytes; over-cap routes are skipped with a comment. */
	capBytes?: number;
}

export type RenderCriticalResult =
	| { ok: true; html: string; bytes: number }
	| { ok: false; reason: string };

/**
 * Inject `<style data-pw-critical="<route>">…</style>` after `<head>`.
 * Idempotent (marker-checked) and cap-guarded. Never throws on malformed
 * HTML — returns a skip reason instead, leaving the file untouched.
 */
export function renderCriticalHtml(options: RenderCriticalOptions): RenderCriticalResult {
	const { html, routeName, css } = options;
	const capBytes = options.capBytes ?? DEFAULT_CAP_BYTES;

	if (css.trim() === "") return { ok: false, reason: "no critical css produced" };
	if (html.includes(`${CRITICAL_MARKER_ATTR}="${routeName}"`)) {
		return { ok: false, reason: "already injected" };
	}
	const headMatch = /<head[^>]*>/i.exec(html);
	if (headMatch === null) return { ok: false, reason: "no <head> element found" };

	const bytes = Buffer.byteLength(css);
	if (bytes > capBytes) {
		return {
			ok: false,
			reason: `payload ${bytes}B exceeds cap ${capBytes}B`,
		};
	}

	const tag = `<style ${CRITICAL_MARKER_ATTR}="${routeName}">${css}</style>\n`;
	return {
		ok: true,
		bytes,
		html:
			html.slice(0, headMatch.index + headMatch[0].length) +
			"\n" +
			tag +
			html.slice(headMatch.index + headMatch[0].length),
	};
}
