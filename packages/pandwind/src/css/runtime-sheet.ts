/** Runtime stylesheet façade composed from store, canonicalizer, ordering, serializer, and DOM sink ports. */
import { DomStyleElementSink } from "./runtime-sheet-sink.ts";
import { PriorityOrderingPolicy, RuntimeRuleStore } from "./runtime-sheet-policies.ts";
import { SemanticRuleCanonicalizer, SemanticRuleSerializer } from "./runtime-sheet-serializer.ts";
import type { RuntimeRule, RuntimeSemanticRule, RuntimeSheetOptions, RuntimeSheetSnapshot } from "./runtime-sheet-contracts.ts";

export type {
	RuntimeDeclaration,
	RuntimeDocument,
	RuntimeRule,
	RuntimeRuleCanonicalizer,
	RuntimeRuleSerializer,
	RuntimeRuleStore,
	RuntimeSemanticRule,
	RuntimeSemanticRuleKind,
	RuntimeSheetOptions,
	RuntimeSheetSnapshot,
	RuntimeStyleElement,
	RuntimeStyleElementSink,
} from "./runtime-sheet-contracts.ts";

export interface RuntimeSheetPorts {
	readonly store?: RuntimeRuleStore;
	readonly ordering?: import("./runtime-sheet-contracts.ts").RuntimeOrderingPolicy;
	readonly canonicalizer?: import("./runtime-sheet-contracts.ts").RuntimeRuleCanonicalizer;
	readonly serializer?: import("./runtime-sheet-contracts.ts").RuntimeRuleSerializer;
	readonly sink?: import("./runtime-sheet-contracts.ts").RuntimeStyleElementSink;
}

export function createRuntimeSheet(options: RuntimeSheetOptions = {}, ports: RuntimeSheetPorts = {}) {
	const store = ports.store ?? new RuntimeRuleStore();
	const ordering = ports.ordering ?? new PriorityOrderingPolicy();
	const serializer = ports.serializer ?? new SemanticRuleSerializer();
	const canonicalizer = ports.canonicalizer ?? new SemanticRuleCanonicalizer(serializer);
	const sink = ports.sink ?? new DomStyleElementSink(options);
	let tokens = "";

	const css = (): string => {
		const body = ordering.order(store.rules).map((rule) => rule.css).filter(Boolean).join("\n");
		return [tokens, body].filter(Boolean).join("\n");
	};
	const render = (): void => sink.update(css());
	const refresh = (): void => {
		if (options.autoMount !== false) sink.mount(css());
		else render();
	};
	const register = (rules: readonly RuntimeRule[]): void => {
		if (store.register(rules)) refresh();
	};
	const setTokens = (value: string): void => {
		if (tokens === value) return;
		tokens = value;
		refresh();
	};
	const snapshot = (): RuntimeSheetSnapshot => ({ tokens, rules: ordering.order(store.rules) });
	const hydrate = (value: RuntimeSheetSnapshot): void => {
		tokens = value.tokens;
		store.replace(value.rules);
		refresh();
	};
	const registerSemanticRules = (rules: readonly RuntimeSemanticRule[]): void => {
		register(rules.map((rule, index) => canonicalizer.canonicalize({ ...rule, priority: rule.priority ?? index })));
	};

	return {
		id: options.id ?? "pandwind",
		css,
		register,
		registerSemanticRules,
		setTokens,
		snapshot,
		hydrate,
		mount: () => sink.mount(css()),
		unmount: () => sink.unmount(),
	};
}

export type RuntimeSheet = ReturnType<typeof createRuntimeSheet>;
