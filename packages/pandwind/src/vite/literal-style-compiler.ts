import type { AnyClassNameStrategy } from "../css/class-name-strategy.ts";
import { normalizeStrategy } from "../css/class-name-strategy.ts";
import { createHashFn } from "../css/hash.ts";
import type { AtomRegistry } from "../css/atoms.ts";
import { resolveDesignStyle } from "../design/resolve.ts";
import { flattenStyle, pairs } from "../lib/utils.ts";
import type { CssPreset } from "./css-extract.ts";

export interface LiteralStyleCompiler {
	readonly registry: AtomRegistry;
	compile(literal: Record<string, unknown>): string | null;
}

export interface LiteralStyleCompilerOptions {
	readonly preset: CssPreset;
	readonly className?: AnyClassNameStrategy;
	readonly debug?: boolean;
}

class PandwindLiteralStyleCompiler implements LiteralStyleCompiler {
	readonly registry: AtomRegistry = new Map();
	private readonly options: LiteralStyleCompilerOptions;
	private readonly className;
	private readonly hashFn;
	private readonly emptyCondition;

	constructor(options: LiteralStyleCompilerOptions) {
		this.options = options;
		this.className = normalizeStrategy(options.className);
		this.hashFn = createHashFn(options.debug === true);
		this.emptyCondition = Object.keys(options.preset.conditions).find(
			(key) => !options.preset.conditions[key],
		);
	}

	compile(literal: Record<string, unknown>): string | null {
		let resolved: Record<string, unknown>;
		try {
			resolved = resolveDesignStyle(literal, this.options.preset.tokens);
		} catch {
			return null;
		}
		const flat = flattenStyle(resolved as never);
		const merged = new Map<string, string>();
		for (const key in flat) {
			const value = flat[key]!;
			if (typeof value === "string" && value.startsWith("input>$")) return null;
			const orderedKey = pairs.join(
				pairs
					.split(key)
					.filter((part) => part !== this.emptyCondition)
					.toSorted(),
			);
			merged.set(orderedKey, String(value));
		}

		const classes: string[] = [];
		for (const [orderedKey, value] of merged) {
			if (orderedKey.includes("$input")) return null;
			let name: string | undefined;
			if (this.className !== undefined) {
				try {
					name = this.className.toClassName(orderedKey, value) ?? undefined;
				} catch {
					return null;
				}
			}
			name ??= this.hashFn(orderedKey, value);
			if (this.className?.sheetBacked === true || this.className === undefined) {
				this.registry.set(name, orderedKey);
			}
			classes.push(name);
		}
		return classes.join(" ");
	}
}

export const createLiteralStyleCompiler = (
	options: LiteralStyleCompilerOptions,
): LiteralStyleCompiler => new PandwindLiteralStyleCompiler(options);
