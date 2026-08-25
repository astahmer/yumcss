import { createHashFn } from "../css/hash.ts";
import type { DesignPreset, DesignStyleObject } from "../design/types.ts";
import { resolveDesignStyle } from "../design/resolve.ts";
import { assign, flattenStyle, type FlatStyles } from "../lib/utils.ts";
import type { StyleObject } from "../types/typings.ts";
import type { StyleBackend } from "./types.ts";

/* ---------------------------------------------------------------------------
 * Object-emitting backend skeleton (plans/021) — shared by every target
 * whose style system consumes plain style objects (React Native, OpenTUI,
 * canvas). The css backend emits class names; object backends emit the
 * style objects themselves.
 *
 * A target configures the skeleton with two policies:
 *
 * - `conditions` — the target's runtime-resolvable conditions. A
 *   condition-nested declaration (`_dark__backgroundColor`) participates
 *   iff every condition's resolver returns true at resolve time; an
 *   unknown condition throws (strict policy — a silently dead style is
 *   never acceptable).
 * - `convert` — the value/unit policy: one resolved IR declaration
 *   (camelCase prop, CSS-shaped value like `"4px 8px"`) to the target's
 *   property shape (possibly expanding shorthands into per-side props).
 *
 * The skeleton owns the rest: flattening, assembly order (later-wins per
 * target property), and a hash-keyed registry so identical styles resolve
 * to the SAME object reference — the stable-identity RN list rendering
 * and memoization care about.
 * -------------------------------------------------------------------------*/

/** A target style object: camelCase props, target-native values. */
export type TargetStyle = Record<string, unknown>;

export interface ObjectBackendOptions {
	/** Mode id, e.g. `"react-native"` (docs/debug/error messages). */
	name: string;
	/**
	 * Runtime-resolvable conditions by bare name (`{ dark: () => isDark }`).
	 * Condition-nested declarations whose conditions are all true apply;
	 * otherwise they are skipped. Conditions without an entry throw.
	 */
	conditions?: Record<string, () => boolean>;
	/**
	 * Value/unit policy: one resolved IR declaration to target properties.
	 * May expand one IR prop into several target props (shorthand split).
	 * Default: pass-through under the same prop name.
	 */
	convert?: (prop: string, value: string) => Record<string, unknown>;
}

export type ObjectBackend = StyleBackend<TargetStyle> & {
	/**
	 * Full pipeline: flatten (IR) -> condition filter -> convert -> assemble
	 * -> registry. Identical inputs (and resolver states) return the same
	 * object reference.
	 */
	resolve(style: StyleObject): TargetStyle;
	/** Last-wins merge of already-resolved target styles, registered. */
	merge(...styles: Array<TargetStyle>): TargetStyle;
};

const splitKey = (key: string): { conditions: string[]; prop: string } => {
	const parts = key.split("__");
	return { conditions: parts.slice(0, -1), prop: parts[parts.length - 1]! };
};

export function createObjectBackend(options: ObjectBackendOptions): ObjectBackend {
	const convert = options.convert ?? ((prop: string, value: string) => ({ [prop]: value }));
	const resolvers = options.conditions ?? {};
	const registry = new Map<string, TargetStyle>();
	const hashFn = createHashFn(false);

	const check = (key: string, _value: string): void => {
		for (const condition of splitKey(key).conditions) {
			const name = condition.replace(/^_/, "");
			if (!(name in resolvers)) {
				throw new Error(
					`pandwind/${options.name}: condition "_${name}" is not supported by this target — ` +
						"remove it, or provide a resolver via conditions",
				);
			}
		}
	};

	const declare = (key: string, value: string): TargetStyle => {
		check(key, value);
		return convert(splitKey(key).prop, String(value));
	};

	const register = (style: TargetStyle): TargetStyle => {
		const entries = Object.entries(style)
			.map(
				([prop, value]) => `${prop}=${typeof value === "string" ? value : JSON.stringify(value)}`,
			)
			.toSorted();
		const hash = hashFn(entries.join("\u0000"), String(entries.length));
		let registered = registry.get(hash);
		if (registered === undefined) {
			registered = style;
			registry.set(hash, registered);
		}
		return registered;
	};

	const resolve = (style: StyleObject): TargetStyle => {
		const flat = flattenStyle(assign(style)) as FlatStyles;
		const out: TargetStyle = {};
		for (const [key, raw] of Object.entries(flat)) {
			const { conditions, prop } = splitKey(key);
			let applicable = true;
			for (const condition of conditions) {
				const name = condition.replace(/^_/, "");
				const applies = resolvers[name];
				if (applies === undefined) {
					throw new Error(
						`pandwind/${options.name}: condition "_${name}" is not supported by this target — ` +
							"remove it, or provide a resolver via conditions",
					);
				}
				if (!applies()) applicable = false;
			}
			if (!applicable) continue;
			Object.assign(out, convert(prop, String(raw)));
		}
		return register(out);
	};

	const merge = (...styles: Array<TargetStyle>): TargetStyle =>
		register(assign(...styles.filter((style) => style !== undefined && style !== null)));

	return { name: options.name, check, declare, resolve, merge };
}

/* ---------------------------------------------------------------------------
 * Surfaces on top of an object backend. Deliberately smaller than the css
 * surface: `.class`/`.vars`/`.props`/`.group` are class-string and CSS
 * custom-property shaped — meaningless without a stylesheet. `css()` calls
 * return registered style objects; `cx` merges them last-wins.
 * -------------------------------------------------------------------------*/

export interface ObjectCssFn<TStyles extends StyleObject = StyleObject> {
	(...styles: Array<TStyles | undefined | null | false>): TargetStyle;
	raw: (...styles: Array<TStyles | undefined | null | false>) => StyleObject;
}

export function createObjectCss<TStyles extends StyleObject = StyleObject>(
	backend: ObjectBackend,
): ObjectCssFn<TStyles> {
	const css = (...styles: Array<TStyles | undefined | null | false>): TargetStyle =>
		backend.resolve(assign(...(styles.filter((style) => style) as Array<StyleObject>)));
	css.raw = (...styles: Array<TStyles | undefined | null | false>): StyleObject =>
		assign(...(styles.filter((style) => style) as Array<StyleObject>));
	return css;
}

export interface ObjectCxFn {
	(
		...inputs: Array<
			TargetStyle | undefined | null | false | Array<TargetStyle | undefined | null | false>
		>
	): TargetStyle;
}

export function createObjectCx(backend: ObjectBackend): ObjectCxFn {
	return (...inputs) => {
		const flat: Array<TargetStyle> = [];
		for (const input of inputs) {
			if (Array.isArray(input)) {
				for (const nested of input) {
					if (nested) flat.push(nested);
				}
			} else if (input) {
				flat.push(input);
			}
		}
		return backend.merge(...flat);
	};
}

/**
 * Design-vocabulary surface over an object backend — the RN/OpenTUI
 * counterpart of createDesignCss: same `$frame`/`$layout`/`$text` modules,
 * resolved against the preset tokens, lowered to target style objects.
 */
export function createDesignObjectCss<TPreset extends DesignPreset>(
	preset: TPreset,
	backend: ObjectBackend,
): ObjectCssFn<DesignStyleObject<TPreset>> {
	// NOTE: assign() returns a fresh merged object (reduce accumulator), it
	// does NOT mutate its first argument — capture the result.
	const resolveAll = (
		...styles: Array<DesignStyleObject<TPreset> | undefined | null | false>
	): StyleObject => {
		let resolved: StyleObject = {};
		for (const style of styles) {
			if (!style) continue;
			resolved = assign(
				resolved,
				resolveDesignStyle(style as unknown as Record<string, unknown>, preset.tokens) as never,
			);
		}
		return resolved;
	};

	const css = (
		...styles: Array<DesignStyleObject<TPreset> | undefined | null | false>
	): TargetStyle => backend.resolve(resolveAll(...styles));
	css.raw = (
		...styles: Array<DesignStyleObject<TPreset> | undefined | null | false>
	): StyleObject => resolveAll(...styles);
	return css;
}
