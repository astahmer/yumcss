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

export type RuntimeSemanticRuleKind =
	| "style"
	| "global"
	| "keyframes"
	| "font-face"
	| "layer"
	| "supports"
	| "property";

export interface RuntimeDeclaration {
	readonly property: string;
	readonly value: string | number | boolean;
}

export interface RuntimeSemanticRule {
	readonly id?: string;
	readonly kind: RuntimeSemanticRuleKind;
	readonly selector?: string;
	readonly name?: string;
	readonly layer?: string;
	readonly conditions?: readonly string[];
	readonly declarations?: readonly RuntimeDeclaration[];
	readonly children?: readonly RuntimeSemanticRule[];
	readonly priority?: number;
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

const semanticHash = (input: string): string => {
	let hash = 2166136261;
	for (let index = 0; index < input.length; index++) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
};

const semanticValue = (value: RuntimeDeclaration["value"]): string =>
	typeof value === "string" ? value : String(value);

const semanticDeclarations = (declarations: readonly RuntimeDeclaration[] = []): string =>
	declarations
		.map((declaration) => `${declaration.property}:${semanticValue(declaration.value)}`)
		.join(";");

const semanticCondition = (condition: string): string => {
	if (/^@(media|container|supports)\b/.test(condition)) return condition;
	if (condition.startsWith(":")) return condition;
	if (condition.startsWith("&")) return condition;
	return `&:${condition}`;
};

const selectorAndConditions = (
	selector: string,
	conditions: readonly string[],
): { selector: string; wrappers: string[] } => {
	let resolved = selector;
	const wrappers: string[] = [];
	for (const condition of conditions) {
		if (/^@(media|container|supports)\b/.test(condition)) {
			wrappers.push(condition);
		} else if (condition.startsWith("&")) {
			resolved = condition.replaceAll("&", resolved);
		} else if (condition.startsWith(":")) {
			resolved += condition;
		} else {
			resolved += `:${condition}`;
		}
	}
	return { selector: resolved, wrappers };
};

const semanticRuleCss = (rule: RuntimeSemanticRule): string => {
	const declarationBody = semanticDeclarations(rule.declarations);
	const children = (rule.children ?? []).map(semanticRuleCss).join("");
	let body: string;
	switch (rule.kind) {
		case "style":
			{
				const resolved = selectorAndConditions(rule.selector ?? "&", rule.conditions ?? []);
				body = `${resolved.selector}{${declarationBody}${children}}`;
				body = resolved.wrappers.reduceRight(
					(current, condition) => `${condition}{${current}}`,
					body,
				);
			}
			break;
		case "global":
			{
				const resolved = selectorAndConditions(rule.selector ?? "*", rule.conditions ?? []);
				body = `${resolved.selector}{${declarationBody}${children}}`;
				body = resolved.wrappers.reduceRight(
					(current, condition) => `${condition}{${current}}`,
					body,
				);
			}
			break;
		case "keyframes":
			body = `@keyframes ${rule.name ?? ""}{${declarationBody}${children}}`;
			break;
		case "font-face":
			body = `@font-face{${declarationBody}${children}}`;
			break;
		case "layer":
			body = `@layer ${rule.layer ?? rule.name ?? ""}{${declarationBody}${children}}`;
			break;
		case "supports":
			body = `@supports ${rule.name ?? ""}{${declarationBody}${children}}`;
			break;
		case "property":
			body = `@property ${rule.name ?? ""}{${declarationBody}${children}}`;
			break;
	}
	if (rule.kind === "style" || rule.kind === "global") return body;
	return (rule.conditions ?? []).reduceRight(
		(current, condition) => `${semanticCondition(condition)}{${current}}`,
		body,
	);
};

const semanticRule = (rule: RuntimeSemanticRule): RuntimeRule => {
	const { priority: _priority, ...semanticIdentity } = rule;
	return {
		id: rule.id ?? `semantic-${semanticHash(JSON.stringify(semanticIdentity))}`,
	css: semanticRuleCss(rule),
	priority: rule.priority ?? 0,
	};
};

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

	const registerSemanticRules = (next: readonly RuntimeSemanticRule[]): void => {
		register(
			next.map((rule, index) => semanticRule({ ...rule, priority: rule.priority ?? index })),
		);
	};

	const unmount = (): void => {
		element?.remove();
		element = undefined;
	};

	return {
		id,
		css,
		register,
		registerSemanticRules,
		setTokens,
		snapshot,
		hydrate,
		mount,
		unmount,
	};
}

export type RuntimeSheet = ReturnType<typeof createRuntimeSheet>;
