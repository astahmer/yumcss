/**
 * Token reference DAG (plans/020 adopt #1, from ultra's token-graph).
 *
 * Builds a directed graph over the three token tiers from the same inputs
 * the theme bridge consumes:
 *
 * - raw nodes: every @theme variable (`--color-red-100`, …)
 * - semantic nodes: raw variables that other tokens depend on
 * - scope nodes: one per `[data-theme]` binding (`theme:<scope>:<var>`)
 * - component nodes: one per component-token key (`component:<name>.<key>`)
 *
 * Edges point from CONSUMER to DEPENDENCY:
 * - a raw variable whose value contains `var(--other)` depends on `--other`
 * - a `[data-theme]` binding depends on the variable it re-binds
 * - a component key depends on the variable it overrides AND on every
 *   `$ref` / `var(--…)` target inside its values
 *
 * A component key that overrides exactly the variable it references is a
 * real CSS cycle (`.pwc-x { --x: var(--x) }` is invalid at computed-value
 * time) — represented as a self-loop on the variable node so cycle detection
 * agrees with the bridge's skip-loudly emission behavior.
 *
 * Computations: cycles (DFS, self-loops included), orphaned raws (@theme
 * vars nothing in the graph depends on — caveat: direct utility usage like
 * `bg-red-500` is invisible here), per-component reachability, dangling
 * references ($refs/var() targets that do not exist in @theme — skipped
 * loudly at emission, listed here for transparency).
 *
 * Deterministic: all node/edge/cycle lists sorted.
 */
import {
	componentVarName,
	type ComponentScopeMap,
	type ThemeScopeMap,
	type ThemeVar,
} from "./generate-theme.ts";

export type TokenTier = "raw" | "semantic" | "scope" | "component";

export interface TokenGraphNode {
	id: string;
	tier: TokenTier;
	label: string;
}

export interface TokenGraphEdge {
	from: string;
	to: string;
}

export interface TokenGraph {
	nodes: Array<TokenGraphNode>;
	edges: Array<TokenGraphEdge>;
	/** Every cycle, each as an ordered list of node ids (self-loops length 2). */
	cycles: Array<Array<string>>;
	/** Raw-tier ids with no incoming edges (unreferenced by other tokens). */
	orphans: Array<string>;
	/** Component id -> every var id its scope ultimately resolves to. */
	reachability: Record<string, Array<string>>;
	/** Referenced custom properties missing from @theme (skipped at emission). */
	dangling: Array<string>;
}

export interface TokenGraphInput {
	flatVars: ReadonlyArray<ThemeVar>;
	themes?: ThemeScopeMap;
	components?: ComponentScopeMap;
}

/** Extract `var(--name)` targets from a value string. */
const varRefsIn = (value: string): Array<string> => {
	const out: Array<string> = [];
	for (const match of value.matchAll(/var\((--[\w-]+)/g)) out.push(match[1]!);
	return out;
};

const CYCLE = 1;
const DONE = 2;

export function buildTokenGraph(input: TokenGraphInput): TokenGraph {
	const nodes = new Map<string, TokenGraphNode>();
	const edgeList: Array<TokenGraphEdge> = [];
	const edgeKeys = new Set<string>();
	const adjacency = new Map<string, Set<string>>();
	const danglingSet = new Set<string>();

	const addNode = (id: string, tier: TokenTier, label: string): void => {
		if (!nodes.has(id)) nodes.set(id, { id, tier, label });
	};
	const addEdge = (from: string, to: string): void => {
		if (from === "" || to === "") return;
		const key = `${from}\u0000${to}`;
		if (edgeKeys.has(key)) return;
		edgeKeys.add(key);
		edgeList.push({ from, to });
		if (!adjacency.has(from)) adjacency.set(from, new Set());
		adjacency.get(from)!.add(to);
	};

	const known = new Set<string>(input.flatVars.map((v) => v.name));

	// --- pass 1: raw tier nodes.
	for (const v of input.flatVars) addNode(v.name, "raw", v.name);

	// --- pass 2: edges between raws from inline var() references.
	for (const v of input.flatVars) {
		for (const ref of varRefsIn(v.value)) {
			if (!known.has(ref)) continue;
			addEdge(v.name, ref);
		}
	}

	// --- pass 3: scope tier ([data-theme] re-bindings).
	if (input.themes !== undefined && typeof input.themes === "object") {
		for (const scope of Object.keys(input.themes).toSorted()) {
			const bindings = input.themes[scope];
			if (bindings === null || typeof bindings !== "object") continue;
			for (const name of Object.keys(bindings).toSorted()) {
				const id = `theme:${scope}:${name}`;
				addNode(id, "scope", `${name} @ ${scope}`);
				addEdge(id, name);
			}
		}
	}

	// --- pass 4: component tier (one node per key).
	const componentIds: Array<string> = [];
	if (input.components !== undefined && typeof input.components === "object") {
		for (const name of Object.keys(input.components).toSorted()) {
			const vars = input.components[name];
			if (vars === null || typeof vars !== "object") continue;
			for (const key of Object.keys(vars).toSorted()) {
				const id = `component:${name}.${componentVarName(key).slice(2)}`;
				addNode(id, "component", `${name}.${key}`);
				componentIds.push(id);

				const ownTarget = componentVarName(key);
				const raw = vars[key];

				const values =
					raw !== null && typeof raw === "object" && !Array.isArray(raw)
						? Object.values(raw as Record<string, unknown>).filter(
								(v): v is string => typeof v === "string",
							)
						: typeof raw === "string"
							? [raw]
							: [];

				// The key overrides this semantic var no matter what the
				// value form is — that dependency always exists.
				addEdge(id, ownTarget);
				let overridesExisting = false;
				for (const value of values.length > 0 ? values : [""]) {
					if (value.startsWith("$")) {
						const target = `--${value
							.slice(1)
							.replace(/\.([a-z0-9])/g, "-$1")
							.toLowerCase()}`;
						if (!known.has(target)) {
							danglingSet.add(target);
							continue;
						}
						addEdge(id, target);
						if (target === ownTarget) overridesExisting = true;
					} else {
						addEdge(id, ownTarget);
					}
					for (const ref of varRefsIn(value)) {
						if (!known.has(ref)) {
							danglingSet.add(ref);
							continue;
						}
						addEdge(id, ref);
					}
				}
				// A key overriding exactly the variable its own value
				// references is an invalid-at-computed-value-time self-cycle:
				// mark the VARIABLE with a self-loop (CSS-level truth).
				if (
					overridesExisting &&
					values.every((v) => v.startsWith("$")) &&
					values.includes(`$${ownTarget.slice(2)}`)
				) {
					addEdge(ownTarget, ownTarget);
				}
			}
		}
	}

	// --- tier refinement: depended-on raws play a semantic role.
	for (const e of edgeList) {
		const target = nodes.get(e.to);
		if (target !== undefined && target.tier === "raw") target.tier = "semantic";
	}

	// --- cycles: iterative-free recursive DFS with color marking.
	const color = new Map<string, number>();
	const stack: Array<string> = [];
	const cycles: Array<Array<string>> = [];
	const visit = (id: string): void => {
		color.set(id, CYCLE);
		stack.push(id);
		for (const next of adjacency.get(id) ?? []) {
			const state = color.get(next) ?? 0;
			if (state === CYCLE) {
				const start = stack.indexOf(next);
				cycles.push([...stack.slice(start), next]);
			} else if (state === 0) {
				visit(next);
			}
		}
		stack.pop();
		color.set(id, DONE);
	};
	for (const id of [...nodes.keys()].toSorted()) {
		if ((color.get(id) ?? 0) === 0) visit(id);
	}

	// --- orphans: raw-tier nodes nothing depends on.
	const dependedOn = new Set(edgeList.map((e) => e.to));
	const orphans = [...known].filter((id) => !dependedOn.has(id)).toSorted();

	// --- per-component reachability (BFS).
	const reachability: Record<string, Array<string>> = {};
	for (const compId of componentIds.toSorted()) {
		const seen = new Set<string>();
		const queue = [compId];
		while (queue.length > 0) {
			const cur = queue.shift()!;
			for (const next of adjacency.get(cur) ?? []) {
				if (seen.has(next)) continue;
				seen.add(next);
				queue.push(next);
			}
		}
		reachability[compId] = [...seen].toSorted();
	}

	return {
		nodes: [...nodes.values()].toSorted((a, b) => a.id.localeCompare(b.id)),
		edges: edgeList.toSorted((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
		cycles,
		orphans,
		reachability,
		dangling: [...danglingSet].toSorted(),
	};
}
