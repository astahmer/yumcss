/**
 * Runtime stylesheet artifacts and their in-memory store.
 *
 * This module knows nothing about the DOM. It is the shared boundary between
 * runtime CSS, SSR, hydration, devtools snapshots, and future sinks.
 */
import {
	createRuntimeRuleCanonicalizer,
	createRuntimeOrderingPolicy,
	type RuntimeOrderingPolicy,
	type RuntimeRuleCanonicalizer,
} from "./runtime-policies.ts";

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

export interface RuntimeRuleStorePort {
	readonly rules: ReadonlyMap<string, RuntimeRule>;
	readonly tokens: string;
	register(next: readonly RuntimeRule[]): boolean;
	setTokens(next: string): boolean;
	snapshot(): RuntimeSheetSnapshot;
	hydrate(input: RuntimeSheetSnapshot): void;
}

export class RuntimeRuleStore implements RuntimeRuleStorePort {
	readonly rules = new Map<string, RuntimeRule>();
	tokens = "";

	constructor(
		private readonly ordering: RuntimeOrderingPolicy = createRuntimeOrderingPolicy(),
		private readonly canonicalizer: RuntimeRuleCanonicalizer = createRuntimeRuleCanonicalizer(),
	) {}

	register(next: readonly RuntimeRule[]): boolean {
		let changed = false;
		for (const input of next) {
			const rule = this.canonicalizer.canonicalize(input);
			const previous = this.rules.get(rule.id);
			if (previous?.css === rule.css && previous.priority === rule.priority) continue;
			this.rules.set(rule.id, rule);
			changed = true;
		}
		return changed;
	}

	setTokens(next: string): boolean {
		if (this.tokens === next) return false;
		this.tokens = next;
		return true;
	}

	ordered(): RuntimeRule[] {
		return this.ordering.order(this.rules.values());
	}

	snapshot(): RuntimeSheetSnapshot {
		return { tokens: this.tokens, rules: this.ordered() };
	}

	hydrate(input: RuntimeSheetSnapshot): void {
		this.tokens = input.tokens;
		this.rules.clear();
		for (const rule of input.rules) this.rules.set(rule.id, rule);
	}
}

export interface RuntimeRuleSerializer {
	serialize(store: RuntimeRuleStorePort): string;
	serializeSemantic(rule: RuntimeSemanticRule): RuntimeRule;
}

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
		if (/^@(media|container|supports)\b/.test(condition)) wrappers.push(condition);
		else if (condition.startsWith("&")) resolved = condition.replaceAll("&", resolved);
		else if (condition.startsWith(":")) resolved += condition;
		else resolved += `:${condition}`;
	}
	return { selector: resolved, wrappers };
};

const semanticRuleCss = (rule: RuntimeSemanticRule): string => {
	const declarationBody = semanticDeclarations(rule.declarations);
	const children = (rule.children ?? []).map(semanticRuleCss).join("");
	let body: string;
	if (rule.kind === "style" || rule.kind === "global") {
		const resolved = selectorAndConditions(
			rule.selector ?? (rule.kind === "global" ? "*" : "&"),
			rule.conditions ?? [],
		);
		body = `${resolved.selector}{${declarationBody}${children}}`;
		return resolved.wrappers.reduceRight((current, condition) => `${condition}{${current}}`, body);
	}
	switch (rule.kind) {
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
	return (rule.conditions ?? []).reduceRight(
		(current, condition) => `${semanticCondition(condition)}{${current}}`,
		body,
	);
};

export interface CssRuntimeRuleSerializerOptions {
	readonly ordering?: RuntimeOrderingPolicy;
}

export class CssRuntimeRuleSerializer implements RuntimeRuleSerializer {
	private readonly ordering: RuntimeOrderingPolicy;

	constructor(options: CssRuntimeRuleSerializerOptions = {}) {
		this.ordering = options.ordering ?? createRuntimeOrderingPolicy();
	}

	serialize(store: RuntimeRuleStorePort): string {
		const body = this.ordering
			.order(store.rules.values())
			.map((rule) => rule.css)
			.filter(Boolean)
			.join("\n");
		return [store.tokens, body].filter(Boolean).join("\n");
	}

	serializeSemantic(rule: RuntimeSemanticRule): RuntimeRule {
		const { priority: _priority, ...semanticIdentity } = rule;
		return {
			id: rule.id ?? `semantic-${semanticHash(JSON.stringify(semanticIdentity))}`,
			css: semanticRuleCss(rule),
			priority: rule.priority ?? 0,
		};
	}
}
