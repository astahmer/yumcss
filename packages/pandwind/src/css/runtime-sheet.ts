/**
 * Runtime CSS sheet for the CSS-in-JS path.
 *
 * The sheet is deliberately DOM-optional: the same instance can collect rules
 * during SSR, serialize a snapshot, hydrate that snapshot in the browser, and
 * mount one deduplicated <style> element when a DOM is available.
 */

export interface RuntimeRule {
	readonly id: string;
	readonly css: string;
	readonly priority: number;
}

export interface RuntimeSheetSnapshot {
	readonly tokens: string;
	readonly rules: RuntimeRule[];
}

export interface RuntimeSheetOptions {
	/** Stable attribute value used to find the sheet during hydration. */
	readonly id?: string;
	/** Mount automatically when rules are first registered in a browser. */
	readonly autoMount?: boolean;
	/** Explicit document for tests, iframes, or multiple browser roots. */
	readonly document?: RuntimeDocument;
	/** Optional CSP nonce applied to the generated style element. */
	readonly nonce?: string;
}

const DEFAULT_ID = "pandwind";

interface RuntimeStyleElement {
	readonly tagName?: string;
	textContent: string;
	setAttribute(name: string, value: string): void;
	nonce?: string;
	remove(): void;
}

interface RuntimeDocument {
	querySelector(selector: string): RuntimeStyleElement | null;
	createElement(name: string): RuntimeStyleElement;
	head: { appendChild(element: RuntimeStyleElement): void };
}

const orderedRules = (rules: ReadonlyMap<string, RuntimeRule>): RuntimeRule[] =>
	Array.from(rules.values()).toSorted(
		(a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
	);

/** Create a deduplicating, SSR-safe runtime stylesheet. */
export function createRuntimeSheet(options: RuntimeSheetOptions = {}) {
	const id = options.id ?? DEFAULT_ID;
	const rules = new Map<string, RuntimeRule>();
	let tokens = "";
	let element: RuntimeStyleElement | undefined;

	const css = (): string => {
		const body = orderedRules(rules)
			.map((rule) => rule.css)
			.filter(Boolean)
			.join("\n");
		return [tokens, body].filter(Boolean).join("\n");
	};

	const resolveDocument = (): RuntimeDocument | undefined => {
		if (options.document !== undefined) return options.document;
		const candidate = (globalThis as { document?: RuntimeDocument }).document;
		return candidate;
	};

	const render = (): void => {
		if (element !== undefined) element.textContent = css();
	};

	const mount = (): boolean => {
		if (element !== undefined) {
			render();
			return true;
		}
		const doc = resolveDocument();
		if (doc === undefined) return false;
		const selector = `style[data-pandwind-sheet="${id}"]`;
		const existing = doc.querySelector(selector);
		if (existing?.tagName === "STYLE") {
			element = existing;
		} else {
			element = doc.createElement("style");
			element.setAttribute("data-pandwind-sheet", id);
			if (options.nonce !== undefined) element.nonce = options.nonce;
			doc.head.appendChild(element);
		}
		render();
		return true;
	};

	const register = (next: readonly RuntimeRule[]): void => {
		let changed = false;
		for (const rule of next) {
			const previous = rules.get(rule.id);
			if (previous?.css === rule.css && previous.priority === rule.priority) continue;
			rules.set(rule.id, rule);
			changed = true;
		}
		if (!changed) return;
		if (options.autoMount !== false) mount();
		else render();
	};

	const setTokens = (next: string): void => {
		if (tokens === next) return;
		tokens = next;
		if (options.autoMount !== false) mount();
		else render();
	};

	const snapshot = (): RuntimeSheetSnapshot => ({
		tokens,
		rules: orderedRules(rules),
	});

	const hydrate = (input: RuntimeSheetSnapshot): void => {
		tokens = input.tokens;
		rules.clear();
		for (const rule of input.rules) rules.set(rule.id, rule);
		if (options.autoMount !== false) mount();
		else render();
	};

	const unmount = (): void => {
		element?.remove();
		element = undefined;
	};

	return {
		id,
		css,
		register,
		setTokens,
		snapshot,
		hydrate,
		mount,
		unmount,
	};
}

export type RuntimeSheet = ReturnType<typeof createRuntimeSheet>;
