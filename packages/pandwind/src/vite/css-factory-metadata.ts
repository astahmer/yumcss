import {
	CssFactoryKind as CssFactoryKindTag,
	type CssFactoryKind,
	type CssFactoryMetadata,
} from "../css/factory-metadata.ts";

const CSS_FACTORY_METADATA = Symbol.for("pandwind.css-factory");

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isCssFactoryKind = (value: unknown): value is CssFactoryKind =>
	value === CssFactoryKindTag.Css || value === CssFactoryKindTag.Design;

const isCssFactoryMetadata = (value: unknown): value is CssFactoryMetadata =>
	isRecord(value) &&
	isCssFactoryKind(value.kind) &&
	typeof value.preset === "object" &&
	value.preset !== null &&
	isRecord(value.options);

export const readCssFactoryMetadata = (value: unknown): CssFactoryMetadata | undefined => {
	if ((typeof value !== "object" || value === null) && typeof value !== "function")
		return undefined;
	const metadata = Object.getOwnPropertyDescriptor(value, CSS_FACTORY_METADATA)?.value;
	return isCssFactoryMetadata(metadata) ? metadata : undefined;
};
