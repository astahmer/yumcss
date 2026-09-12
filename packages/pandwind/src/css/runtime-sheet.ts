/** Runtime stylesheet façade composed from store, canonicalizer, ordering, serializer, and DOM sink ports. */
import { DomStyleElementSink } from "./runtime-sheet-sink.ts";
import { PriorityOrderingPolicy, RuntimeRuleStore } from "./runtime-sheet-policies.ts";
import { SemanticRuleCanonicalizer, SemanticRuleSerializer } from "./runtime-sheet-serializer.ts";
import { RuntimeSemanticRuleKindTag } from "./runtime-sheet-contracts.ts";
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

/**
 * Replaceable policies for a {@link RuntimeSheet}.
 *
 * The default composition suits browser and SSR use. Pass explicit ports when
 * an integration needs a custom sink or wants to inspect the semantic rule
 * stream without coupling itself to the DOM.
 *
 * @category runtime
 * @since 0.1.0
 */
export interface RuntimeSheetPorts {
	readonly store?: RuntimeRuleStore;
	readonly ordering?: import("./runtime-sheet-contracts.ts").RuntimeOrderingPolicy;
	readonly canonicalizer?: import("./runtime-sheet-contracts.ts").RuntimeRuleCanonicalizer;
	readonly serializer?: import("./runtime-sheet-contracts.ts").RuntimeRuleSerializer;
	readonly sink?: import("./runtime-sheet-contracts.ts").RuntimeStyleElementSink;
}

interface RuntimeRuleBatch {
	readonly rules: readonly RuntimeRule[];
	readonly previousCount: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isSafeText = (value: unknown): value is string =>
	typeof value === "string" && value.length > 0 && !value.includes("\u0000");

const isSafeString = (value: unknown): value is string =>
	typeof value === "string" && !value.includes("\u0000");

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === "string" && value.length > 0;

const isRuntimeRule = (value: unknown): value is RuntimeRule =>
	isRecord(value) &&
	isNonEmptyString(value.id) &&
	isSafeText(value.css) &&
	Number.isFinite(value.priority);

const isRuntimeSemanticRule = (value: unknown): value is RuntimeSemanticRule => {
	if (!isRecord(value)) return false;
	type Pending = { readonly value: Record<string, unknown>; readonly exit: boolean };
	const active = new WeakSet<object>();
	const pending: Pending[] = [{ value, exit: false }];
	while (pending.length > 0) {
		const entry = pending.pop()!;
		if (entry.exit) {
			active.delete(entry.value);
			continue;
		}
		const current = entry.value;
		if (active.has(current)) return false;
		active.add(current);
		pending.push({ value: current, exit: true });
		const kind = current.kind;
		if (
			kind !== RuntimeSemanticRuleKindTag.Style &&
			kind !== RuntimeSemanticRuleKindTag.Global &&
			kind !== RuntimeSemanticRuleKindTag.Keyframes &&
			kind !== RuntimeSemanticRuleKindTag.FontFace &&
			kind !== RuntimeSemanticRuleKindTag.Layer &&
			kind !== RuntimeSemanticRuleKindTag.Supports &&
			kind !== RuntimeSemanticRuleKindTag.Property
		)
			return false;
		for (const key of ["id", "selector", "name", "layer"]) {
			if (current[key] !== undefined && !isSafeText(current[key])) return false;
		}
		if (current.priority !== undefined && !Number.isFinite(current.priority)) return false;
		if (current.conditions !== undefined) {
			if (!Array.isArray(current.conditions) || !current.conditions.every(isSafeText)) return false;
		}
		if (current.declarations !== undefined) {
			if (
				!Array.isArray(current.declarations) ||
				!current.declarations.every(
					(item) =>
						isRecord(item) &&
						isSafeText(item.property) &&
						(isSafeText(item.value) ||
							typeof item.value === "boolean" ||
							(typeof item.value === "number" && Number.isFinite(item.value))),
				)
			)
				return false;
		}
		if (current.children !== undefined) {
			if (!Array.isArray(current.children)) return false;
			for (let index = current.children.length - 1; index >= 0; index--) {
				const child = current.children[index];
				if (!isRecord(child)) return false;
				pending.push({ value: child, exit: false });
			}
		}
		if (
			(kind === RuntimeSemanticRuleKindTag.Keyframes ||
				kind === RuntimeSemanticRuleKindTag.Supports ||
				kind === RuntimeSemanticRuleKindTag.Property) &&
			typeof current.name !== "string"
		)
			return false;
		if (
			kind === RuntimeSemanticRuleKindTag.Layer &&
			current.layer === undefined &&
			current.name === undefined
		)
			return false;
	}
	return true;
};

/**
 * Create a runtime stylesheet with optional DOM mounting.
 *
 * A sheet deduplicates rules and keeps cascade order deterministic. Its
 * `snapshot` and `hydrate` methods make the same rule state portable from SSR
 * to the browser.
 *
 * @example
 * ```ts
 * import { createRuntimeSheet } from "pandwind/css/runtime";
 *
 * const serverSheet = createRuntimeSheet({ id: "app", autoMount: false });
 * serverSheet.register([
 *   { id: "button", css: ".button { color: var(--brand); }", priority: 0 },
 * ]);
 *
 * const snapshot = serverSheet.snapshot();
 * const clientSheet = createRuntimeSheet({ id: "app", autoMount: false });
 * clientSheet.hydrate(snapshot);
 * const css = clientSheet.css();
 * ```
 *
 * @param options - Identity, mounting, document, and CSP nonce options.
 * @param ports - Optional replacement policies.
 * @returns A live sheet with registration, serialization, mounting, and
 *   snapshot/hydration operations.
 * @category runtime
 * @since 0.1.0
 */
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
	const refresh = (batch?: RuntimeRuleBatch): void => {
		if (batch !== undefined && mounted && sink.insert !== undefined) {
			const additions = batch.rules
				.map((rule) => ({ rule, index: ordered.findIndex((current) => current.id === rule.id) }))
				.toSorted((left, right) => left.index - right.index);
			let existingRuleCount = batch.previousCount;
			for (const { rule, index } of additions) {
				if (!sink.insert(rule, index, existingRuleCount)) break;
				existingRuleCount++;
			}
			if (existingRuleCount === batch.previousCount + additions.length) return;
		}
		if (autoMount) mounted = sink.mount(css());
		else if (mounted) render();
	};
	const register = (rules: readonly RuntimeRule[]): void => {
		if (!Array.isArray(rules)) return;
		const validRules = rules.filter(isRuntimeRule);
		if (validRules.length === 0) return;
		const canInsert =
			orderedGeneration === generation &&
			ordering.insert !== undefined &&
			validRules.every((rule, index) => {
				if (store.rules.has(rule.id)) return false;
				for (let previous = 0; previous < index; previous++) {
					if (validRules[previous]!.id === rule.id) return false;
				}
				return true;
			});
		if (store.register(validRules)) {
			if (canInsert) {
				const previousCount = ordered.length;
				generation++;
				ordered = ordering.insert!(ordered, validRules);
				orderedGeneration = generation;
				refresh({ rules: validRules, previousCount });
			} else {
				invalidate();
				refresh();
			}
		}
	};
	const setTokens = (value: string): void => {
		if (!isSafeString(value)) return;
		if (tokens === value) return;
		tokens = value;
		invalidate();
		refresh();
	};
	const snapshot = (): RuntimeSheetSnapshot => ({ tokens, rules: orderedRules().slice() });
	const hydrate = (value: RuntimeSheetSnapshot): void => {
		if (!isRecord(value) || !isSafeString(value.tokens) || !Array.isArray(value.rules)) return;
		tokens = value.tokens;
		store.replace(value.rules.filter(isRuntimeRule));
		invalidate();
		refresh();
	};
	const registerSemanticRules = (rules: readonly RuntimeSemanticRule[]): void => {
		if (!Array.isArray(rules)) return;
		register(
			rules
				.filter(isRuntimeSemanticRule)
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

/** The live sheet returned by {@link createRuntimeSheet}. */
export type RuntimeSheet = ReturnType<typeof createRuntimeSheet>;
