import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import { createHashFn } from "../css/hash.ts";
import type { AtomRegistry } from "../css/atoms.ts";
import { cssPropertyFromKey } from "../backends/css.ts";
import { isSafeCssValue, normalizeCssValue } from "../css/value-normalization.ts";
import { resolveDesignStyle } from "../design/resolve.ts";
import { flattenStyle, pairs } from "../lib/utils.ts";
import type { CssPreset } from "./css-extract.ts";

export interface PreparedStyle {
	readonly key: string;
	readonly value: string;
	readonly className: string;
}

export interface LiteralStyleCompiler {
	readonly registry: AtomRegistry;
	readonly preparedStyles: ReadonlyMap<string, readonly PreparedStyle[]>;
	compile(literal: Record<string, unknown>, source?: string): string | null;
	clear(source: string): void;
}

export interface LiteralStyleCompilerOptions {
	readonly preset: CssPreset;
	readonly className?: ClassNameStrategy;
	readonly debug?: boolean;
	readonly propertyAliases?: Readonly<Record<string, string>>;
}

class PandwindLiteralStyleCompiler implements LiteralStyleCompiler {
	readonly registry: AtomRegistry = new Map();
	readonly preparedStyles = new Map<string, readonly PreparedStyle[]>();
	private readonly options: LiteralStyleCompilerOptions;
	private readonly className;
	private readonly hashFn;
	private readonly emptyCondition;

	constructor(options: LiteralStyleCompilerOptions) {
		this.options = options;
		this.className = options.className;
		this.hashFn = createHashFn(options.debug === true);
		this.emptyCondition = Object.keys(options.preset.conditions).find(
			(key) => !options.preset.conditions[key],
		);
	}

	compile(literal: Record<string, unknown>, source?: string): string | null {
		let resolved: Record<string, unknown>;
		try {
			resolved = resolveDesignStyle(literal, this.options.preset.tokens);
		} catch {
			return null;
		}
		const flat = flattenStyle(resolved as never);
		const merged = new Map<string, string>();
		for (const key of Object.keys(flat)) {
			const rawValue = flat[key];
			if (!isSafeCssValue(rawValue)) return null;
			if (typeof rawValue === "string" && rawValue.startsWith("input>$")) return null;
			const orderedKey = pairs.join(
				pairs
					.split(key)
					.filter((part) => part !== this.emptyCondition)
					.toSorted(),
			);
			const property = cssPropertyFromKey(
				orderedKey,
				this.options.preset.conditions,
				this.options.propertyAliases,
			);
			merged.set(orderedKey, normalizeCssValue(property, rawValue));
		}

		const classes: string[] = [];
		const prepared: PreparedStyle[] = [];
		for (const [orderedKey, value] of merged) {
			if (orderedKey.includes("$input")) return null;
			let name: string | undefined;
			if (this.className !== undefined) {
				try {
					const custom = this.className.toClassName(orderedKey, value);
					name =
						typeof custom === "string" &&
						custom.length > 0 &&
						!/\s/.test(custom) &&
						!custom.includes("\u0000")
							? custom
							: undefined;
				} catch {
					return null;
				}
			}
			name ??= this.hashFn(orderedKey, value);
			if (this.className?.sheetBacked === true || this.className === undefined) {
				this.registry.set(name, orderedKey);
			}
			classes.push(name);
			prepared.push({ key: orderedKey, value, className: name });
		}
		if (source !== undefined && prepared.length > 0) {
			const previous = this.preparedStyles.get(source) ?? [];
			this.preparedStyles.set(source, [...previous, ...prepared]);
		}
		return classes.join(" ");
	}

	clear(source: string): void {
		this.preparedStyles.delete(source);
	}
}

export const createLiteralStyleCompiler = (
	options: LiteralStyleCompilerOptions,
): LiteralStyleCompiler => new PandwindLiteralStyleCompiler(options);
