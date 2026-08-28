export interface RuntimeRule {
	readonly id: string;
	readonly css: string;
	readonly priority: number;
}

export type RuntimeSemanticRuleKind = "style" | "global" | "keyframes" | "font-face" | "layer" | "supports" | "property";

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

export interface RuntimeStyleElement {
	readonly tagName?: string;
	textContent: string;
	setAttribute(name: string, value: string): void;
	nonce?: string;
	remove(): void;
}

export interface RuntimeDocument {
	querySelector(selector: string): RuntimeStyleElement | null;
	createElement(name: string): RuntimeStyleElement;
	head: { appendChild(element: RuntimeStyleElement): void };
}

export interface RuntimeSheetOptions {
	readonly id?: string;
	readonly autoMount?: boolean;
	readonly document?: RuntimeDocument;
	readonly nonce?: string;
}

export interface RuntimeRuleStore {
	readonly rules: ReadonlyMap<string, RuntimeRule>;
	register(rules: readonly RuntimeRule[]): boolean;
	replace(snapshot: readonly RuntimeRule[]): void;
}

export interface RuntimeOrderingPolicy {
	order(rules: ReadonlyMap<string, RuntimeRule>): RuntimeRule[];
}

export interface RuntimeRuleCanonicalizer {
	canonicalize(rule: RuntimeSemanticRule): RuntimeRule;
}

export interface RuntimeRuleSerializer {
	serialize(rule: RuntimeSemanticRule): string;
}

export interface RuntimeStyleElementSink {
	mount(css: string): boolean;
	update(css: string): void;
	unmount(): void;
}
