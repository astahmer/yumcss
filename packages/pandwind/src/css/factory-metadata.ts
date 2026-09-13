import type { CreateCssOptions } from "./runtime-base.ts";

export const CssFactoryKind = {
	Css: "css",
	Design: "design",
} as const;

export type CssFactoryKind = (typeof CssFactoryKind)[keyof typeof CssFactoryKind];

export interface CssFactoryMetadata {
	readonly kind: CssFactoryKind;
	readonly preset: object;
	readonly options: Pick<
		CreateCssOptions,
		"debug" | "className" | "cascade" | "namespace" | "propertyAliases"
	>;
}

const CSS_FACTORY_METADATA = Symbol.for("pandwind.css-factory");

export const attachCssFactoryMetadata = <TValue extends object>(
	value: TValue,
	metadata: CssFactoryMetadata,
): TValue => {
	Object.defineProperty(value, CSS_FACTORY_METADATA, {
		configurable: false,
		enumerable: false,
		value: metadata,
		writable: false,
	});
	return value;
};
