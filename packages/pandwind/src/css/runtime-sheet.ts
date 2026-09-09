/** Runtime stylesheet façade composed from store, canonicalizer, ordering, serializer, and DOM sink ports. */
import { DomStyleElementSink } from "./runtime-sheet-sink.ts";
import { PriorityOrderingPolicy, RuntimeRuleStore } from "./runtime-sheet-policies.ts";
import { SemanticRuleCanonicalizer, SemanticRuleSerializer } from "./runtime-sheet-serializer.ts";
import type {
	RuntimeRule,
	RuntimeSemanticRule,
	RuntimeSheetOptions,
	RuntimeSheetSnapshot,
} from "./runtime-sheet-contracts.ts";

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

export function createRuntimeSheet(
	options: RuntimeSheetOptions = {},
	ports: RuntimeSheetPorts = {},
) {
	const store = ports.store ?? new RuntimeRuleStore();
	const ordering = ports.ordering ?? new PriorityOrderingPolicy();
	const serializer = ports.serializer ?? new SemanticRuleSerializer();
	const canonicalizer = ports.canonicalizer ?? new SemanticRuleCanonicalizer(serializer);
	const sink = ports.sink ?? new DomStyleElementSink(options);
	const hasDocument =
		options.document !== undefined || (globalThis as { document?: unknown }).document !== undefined;
	const autoMount = options.autoMount ?? (ports.sink !== undefined || hasDocument);
	let tokens = "";
	let generation = 0;
	let renderedGeneration = -1;
	let rendered = "";
	let orderedGeneration = -1;
	let ordered: RuntimeRule[] = [];
	let mounted = false;
	const invalidate = (): void => {
		generation++;
	};
	const orderedRules = (): RuntimeRule[] => {
		if (orderedGeneration !== generation) {
			ordered = ordering.order(store.rules);
			orderedGeneration = generation;
		}
		return ordered;
	};

	const css = (): string => {
		if (renderedGeneration === generation) return rendered;
		const body = orderedRules()
			.map((rule) => rule.css)
			.filter(Boolean)
			.join("\n");
		rendered = [tokens, body].filter(Boolean).join("\n");
		renderedGeneration = generation;
		return rendered;
	};
	const render = (): void => sink.update(css());
	const refresh = (): void => {
		if (autoMount) mounted = sink.mount(css());
		else if (mounted) render();
	};
	const register = (rules: readonly RuntimeRule[]): void => {
		const canInsert =
			orderedGeneration === generation &&
			ordering.insert !== undefined &&
			rules.every((rule, index) => {
				if (store.rules.has(rule.id)) return false;
				for (let previous = 0; previous < index; previous++) {
					if (rules[previous]!.id === rule.id) return false;
				}
				return true;
			});
		if (store.register(rules)) {
			if (canInsert) {
				generation++;
				ordered = ordering.insert!(ordered, rules);
				orderedGeneration = generation;
			} else {
				invalidate();
			}
			refresh();
		}
	};
	const setTokens = (value: string): void => {
		if (tokens === value) return;
		tokens = value;
		invalidate();
		refresh();
	};
	const snapshot = (): RuntimeSheetSnapshot => ({ tokens, rules: orderedRules().slice() });
	const hydrate = (value: RuntimeSheetSnapshot): void => {
		tokens = value.tokens;
		store.replace(value.rules);
		invalidate();
		refresh();
	};
	const registerSemanticRules = (rules: readonly RuntimeSemanticRule[]): void => {
		register(
			rules
				.filter((rule) => (rule.declarations?.length ?? 0) > 0 || (rule.children?.length ?? 0) > 0)
				.map((rule, index) =>
					canonicalizer.canonicalize({ ...rule, priority: rule.priority ?? index }),
				),
		);
	};

	return {
		id: options.id ?? "pandwind",
		css,
		register,
		registerSemanticRules,
		setTokens,
		snapshot,
		hydrate,
		mount: () => {
			mounted = sink.mount(css());
			return mounted;
		},
		unmount: () => {
			sink.unmount();
			mounted = false;
		},
	};
}

export type RuntimeSheet = ReturnType<typeof createRuntimeSheet>;
