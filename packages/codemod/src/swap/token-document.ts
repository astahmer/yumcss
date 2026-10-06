import { createHash } from "node:crypto";
import { z } from "zod";
import {
	TokenFormatId,
	type TokenFormatLoss,
	type TokenFormatId as TokenFormatIdValue,
} from "./token-format-contracts.ts";
import {
	serializeDtcgTokenDocument as serializeValidatedDtcgTokenDocument,
	serializeTokenResolverDocument as serializeValidatedTokenResolverDocument,
} from "./token-document-serializer.ts";

export const TOKEN_DOCUMENT_SCHEMA = "yumcss.token-document/1" as const;
export const TOKEN_RESOLVER_SCHEMA = "yumcss.token-resolver/1" as const;

export type TokenJsonValue =
	| string
	| number
	| boolean
	| null
	| readonly TokenJsonValue[]
	| { readonly [key: string]: TokenJsonValue };

export type TokenValue =
	| { readonly kind: "string"; readonly value: string }
	| { readonly kind: "number"; readonly value: number }
	| { readonly kind: "boolean"; readonly value: boolean }
	| { readonly kind: "null" }
	| {
			readonly kind: "reference";
			readonly syntax: "curly" | "json-pointer";
			readonly target: string;
			readonly authored: string;
	  }
	| { readonly kind: "array"; readonly items: readonly TokenValue[] }
	| { readonly kind: "object"; readonly entries: Readonly<Record<string, TokenValue>> }
	| {
			readonly kind: "contextual";
			readonly source: string;
			readonly values: Readonly<Record<string, TokenValue>>;
	  };

export interface TokenMetadata {
	readonly type?: string;
	readonly description?: string;
	readonly deprecated?: boolean | string;
	readonly extensions?: Readonly<Record<string, TokenJsonValue>>;
	readonly sourceMetadata?: Readonly<Record<string, TokenJsonValue>>;
}

export interface TokenEntry extends TokenMetadata {
	readonly kind: "token";
	readonly value: TokenValue;
	readonly effectiveType?: string;
}

export interface TokenGroup extends TokenMetadata {
	readonly kind: "group";
	readonly extends?: string | readonly string[];
	readonly root?: TokenEntry;
	readonly children: Readonly<Record<string, TokenNode>>;
}

export type TokenNode = TokenEntry | TokenGroup;

export interface TokenResolverSet {
	readonly sources: readonly TokenJsonValue[];
	readonly sourceMetadata?: Readonly<Record<string, TokenJsonValue>>;
}

export interface TokenResolverModifier {
	readonly contexts: Readonly<Record<string, readonly TokenJsonValue[]>>;
	readonly default?: string;
	readonly sourceMetadata?: Readonly<Record<string, TokenJsonValue>>;
}

export interface TokenResolverDocument {
	readonly schema: typeof TOKEN_RESOLVER_SCHEMA;
	readonly version: string;
	readonly name?: string;
	readonly description?: string;
	readonly sets: Readonly<Record<string, TokenResolverSet>>;
	readonly modifiers: Readonly<Record<string, TokenResolverModifier>>;
	readonly resolutionOrder: readonly TokenJsonValue[];
	readonly sourceMetadata?: Readonly<Record<string, TokenJsonValue>>;
	readonly sourceDocument?: TokenJsonValue;
}

export interface TokenDocument {
	readonly schema: typeof TOKEN_DOCUMENT_SCHEMA;
	readonly format: TokenFormatIdValue;
	readonly formatVersion: string;
	readonly sourceFingerprint: string;
	readonly sourceLosses?: readonly TokenFormatLoss[];
	readonly root: TokenGroup;
	readonly resolver?: TokenResolverDocument;
}

export interface TokenDiagnostic {
	readonly code: string;
	readonly path: string;
	readonly message: string;
}

export interface TokenContextSelection {
	readonly contexts: Readonly<Record<string, string>>;
}

export const TOKEN_PRESET_CONTEXT_SOURCE = "preset" as const;

export interface TokenSourceLoader {
	load(reference: string): Promise<TokenDocument>;
	parseInline?: (source: TokenJsonValue) => Promise<TokenDocument>;
}

export class TokenDocumentValidationError extends Error {
	readonly diagnostics: readonly TokenDiagnostic[];

	constructor(diagnostics: readonly TokenDiagnostic[]) {
		super(diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`).join("\n"));
		this.name = "TokenDocumentValidationError";
		this.diagnostics = diagnostics;
	}
}

const JsonValueSchema = z.json();
const DTCG_TOKEN_TYPES = new Set([
	"string",
	"color",
	"dimension",
	"fontFamily",
	"fontWeight",
	"duration",
	"cubicBezier",
	"number",
	"strokeStyle",
	"border",
	"transition",
	"shadow",
	"gradient",
	"typography",
]);
const DTCG_COLOR_SPACES = new Set([
	"srgb",
	"srgb-linear",
	"hsl",
	"hwb",
	"lab",
	"lch",
	"oklab",
	"oklch",
	"display-p3",
	"a98-rgb",
	"prophoto-rgb",
	"rec2020",
	"xyz-d65",
	"xyz-d50",
]);
const DTCG_STROKE_STYLES = new Set([
	"solid",
	"dashed",
	"dotted",
	"double",
	"groove",
	"ridge",
	"outset",
	"inset",
]);
const DTCG_LINE_CAPS = new Set(["round", "butt", "square"]);
const DTCG_FONT_WEIGHT_NAMES = new Set([
	"thin",
	"hairline",
	"extra-light",
	"ultra-light",
	"light",
	"normal",
	"regular",
	"book",
	"medium",
	"semi-bold",
	"demi-bold",
	"bold",
	"extra-bold",
	"ultra-bold",
	"black",
	"heavy",
	"extra-black",
	"ultra-black",
]);
const DTCG_COMPONENT_TYPES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	color: { colorSpace: "string", components: "number", alpha: "number", hex: "string" },
	dimension: { value: "number", unit: "string" },
	duration: { value: "number", unit: "string" },
	strokeStyle: { dashArray: "dimension", lineCap: "string" },
	border: { color: "color", width: "dimension", style: "strokeStyle" },
	transition: { duration: "duration", delay: "duration", timingFunction: "cubicBezier" },
	shadow: {
		color: "color",
		offsetX: "dimension",
		offsetY: "dimension",
		blur: "dimension",
		spread: "dimension",
	},
	gradient: { color: "color", position: "number" },
	typography: {
		fontFamily: "fontFamily",
		fontSize: "dimension",
		fontWeight: "fontWeight",
		letterSpacing: "dimension",
		lineHeight: "number",
	},
};
const DTCG_COLOR_COMPONENT_RANGES: Readonly<
	Record<string, readonly (readonly [number, number, boolean?])[]>
> = {
	srgb: [
		[0, 1],
		[0, 1],
		[0, 1],
	],
	"srgb-linear": [
		[0, 1],
		[0, 1],
		[0, 1],
	],
	hsl: [
		[0, 360, true],
		[0, 100],
		[0, 100],
	],
	hwb: [
		[0, 360, true],
		[0, 100],
		[0, 100],
	],
	lab: [
		[0, 100],
		[-Infinity, Infinity],
		[-Infinity, Infinity],
	],
	lch: [
		[0, 100],
		[0, Infinity],
		[0, 360, true],
	],
	oklab: [
		[0, 1],
		[-Infinity, Infinity],
		[-Infinity, Infinity],
	],
	oklch: [
		[0, 1],
		[0, Infinity],
		[0, 360, true],
	],
	"display-p3": [
		[0, 1],
		[0, 1],
		[0, 1],
	],
	"a98-rgb": [
		[0, 1],
		[0, 1],
		[0, 1],
	],
	"prophoto-rgb": [
		[0, 1],
		[0, 1],
		[0, 1],
	],
	rec2020: [
		[0, 1],
		[0, 1],
		[0, 1],
	],
	"xyz-d65": [
		[0, 1],
		[0, 1],
		[0, 1],
	],
	"xyz-d50": [
		[0, 1],
		[0, 1],
		[0, 1],
	],
};
const TokenDocumentEnvelopeSchema = z.strictObject({
	schema: z.literal(TOKEN_DOCUMENT_SCHEMA),
	format: z.enum([
		"dtcg",
		"dtcg-resolver",
		"theme",
		"panda",
		"preset",
		"sd",
		"figma",
		"rootcss",
		"stylex",
	]),
	formatVersion: z.string().min(1),
	sourceFingerprint: z.string().min(1),
	sourceLosses: z
		.array(z.strictObject({ path: z.string(), feature: z.string(), reason: z.string() }))
		.optional(),
	root: JsonValueSchema,
	resolver: JsonValueSchema.optional(),
});

const own = (value: Record<string, unknown>, key: string): boolean => Object.hasOwn(value, key);
const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const jsonRecord = (value: unknown): value is Record<string, TokenJsonValue> =>
	isRecord(value) &&
	Object.values(value).every((entry) => JsonValueSchema.safeParse(entry).success);

const hashText = (text: string): string => createHash("sha256").update(text).digest("hex");

const referenceValue = (value: string): TokenValue => {
	const match = /^\{([^{}]+)\}$/.exec(value);
	if (match === null) return { kind: "string", value };
	const target = match[1]!;
	return {
		kind: "reference",
		syntax: "curly",
		target,
		authored: value,
	};
};

const jsonPointerReference = (
	value: unknown,
	path: string,
	diagnostics: TokenDiagnostic[],
): TokenValue | undefined => {
	if (!isRecord(value) || !own(value, "$ref")) return undefined;
	if (
		Object.keys(value).length !== 1 ||
		typeof value.$ref !== "string" ||
		!value.$ref.startsWith("#")
	) {
		diagnostics.push({
			code: "invalid-reference",
			path,
			message: "JSON Pointer references must be an object containing only a string $ref fragment",
		});
		return { kind: "null" };
	}
	return { kind: "reference", syntax: "json-pointer", target: value.$ref, authored: value.$ref };
};

const parseValue = (value: unknown, path: string, diagnostics: TokenDiagnostic[]): TokenValue => {
	if (typeof value === "string") return referenceValue(value);
	if (typeof value === "number" && Number.isFinite(value)) return { kind: "number", value };
	if (typeof value === "boolean") return { kind: "boolean", value };
	if (value === null) return { kind: "null" };
	if (Array.isArray(value))
		return {
			kind: "array",
			items: value.map((entry, index) => parseValue(entry, `${path}/${index}`, diagnostics)),
		};
	if (isRecord(value)) {
		const reference = jsonPointerReference(value, path, diagnostics);
		if (reference !== undefined) return reference;
		const entries: Record<string, TokenValue> = {};
		for (const [key, entry] of Object.entries(value))
			entries[key] = parseValue(entry, `${path}/${escapePointer(key)}`, diagnostics);
		return { kind: "object", entries };
	}
	diagnostics.push({
		code: "invalid-token-value",
		path,
		message: "token value must be JSON-compatible",
	});
	return { kind: "null" };
};

const escapePointer = (segment: string): string =>
	segment.replaceAll("~", "~0").replaceAll("/", "~1");

const parseMetadata = (
	value: Record<string, unknown>,
	path: string,
	diagnostics: TokenDiagnostic[],
	allowed: ReadonlySet<string>,
): TokenMetadata => {
	const metadata: {
		type?: string;
		description?: string;
		deprecated?: boolean | string;
		extensions?: Readonly<Record<string, TokenJsonValue>>;
		sourceMetadata?: Readonly<Record<string, TokenJsonValue>>;
	} = {};
	if (own(value, "$type")) {
		if (typeof value.$type === "string" && value.$type.length > 0) metadata.type = value.$type;
		else
			diagnostics.push({
				code: "invalid-token-type",
				path: `${path}/$type`,
				message: "$type must be a non-empty string",
			});
	}
	if (own(value, "$description")) {
		if (typeof value.$description === "string") metadata.description = value.$description;
		else
			diagnostics.push({
				code: "invalid-description",
				path: `${path}/$description`,
				message: "$description must be a string",
			});
	}
	if (own(value, "$deprecated")) {
		if (typeof value.$deprecated === "boolean" || typeof value.$deprecated === "string")
			metadata.deprecated = value.$deprecated;
		else
			diagnostics.push({
				code: "invalid-deprecation",
				path: `${path}/$deprecated`,
				message: "$deprecated must be a boolean or string",
			});
	}
	if (own(value, "$extensions")) {
		if (jsonRecord(value.$extensions)) metadata.extensions = value.$extensions;
		else
			diagnostics.push({
				code: "invalid-extensions",
				path: `${path}/$extensions`,
				message: "$extensions must be a JSON object keyed by extension namespace",
			});
	}
	const sourceMetadata = Object.fromEntries(
		Object.entries(value).filter(
			([key, entry]) =>
				!allowed.has(key) && key.startsWith("$") && JsonValueSchema.safeParse(entry).success,
		),
	);
	if (Object.keys(sourceMetadata).length > 0)
		metadata.sourceMetadata = sourceMetadata as Record<string, TokenJsonValue>;
	return metadata;
};

const parseTokenEntry = (
	value: Record<string, unknown>,
	path: string,
	diagnostics: TokenDiagnostic[],
): TokenEntry | undefined => {
	const hasValue = own(value, "$value");
	const hasReference = own(value, "$ref");
	if (hasValue && hasReference) {
		diagnostics.push({
			code: "invalid-token-reference",
			path,
			message: "token cannot contain both $value and $ref",
		});
		return undefined;
	}
	if (!hasValue && !hasReference) {
		diagnostics.push({
			code: "missing-token-value",
			path: `${path}/$value`,
			message: "token entry requires $value",
		});
		return undefined;
	}
	const allowed = new Set([
		"$value",
		"$ref",
		"$type",
		"$description",
		"$deprecated",
		"$extensions",
	]);
	for (const key of Object.keys(value))
		if (!key.startsWith("$"))
			diagnostics.push({
				code: "invalid-token-member",
				path: `${path}/${escapePointer(key)}`,
				message: "token entries may only contain DTCG metadata and $value",
			});
	const metadata = parseMetadata(value, path, diagnostics, allowed);
	const tokenValue = hasReference
		? jsonPointerReference({ $ref: value.$ref }, `${path}/$ref`, diagnostics)
		: parseValue(value.$value, `${path}/$value`, diagnostics);
	return tokenValue === undefined ? undefined : { kind: "token", ...metadata, value: tokenValue };
};

const parseGroup = (value: unknown, path: string, diagnostics: TokenDiagnostic[]): TokenGroup => {
	if (!isRecord(value)) {
		diagnostics.push({ code: "invalid-group", path, message: "group must be an object" });
		return { kind: "group", children: {} };
	}
	const extendsValue = value.$extends;
	let extendsTokens: string | readonly string[] | undefined;
	if (extendsValue !== undefined) {
		if (typeof extendsValue === "string") extendsTokens = extendsValue;
		else
			diagnostics.push({
				code: "invalid-extends",
				path: `${path}/$extends`,
				message: "$extends must be a reference string",
			});
	}
	const rootValue = value.$root;
	let root: TokenEntry | undefined;
	if (rootValue !== undefined) {
		if (isRecord(rootValue)) root = parseTokenEntry(rootValue, `${path}/$root`, diagnostics);
		else
			diagnostics.push({
				code: "invalid-root-token",
				path: `${path}/$root`,
				message: "$root must be a token object",
			});
	}
	const metadata = parseMetadata(
		value,
		path,
		diagnostics,
		new Set(["$type", "$description", "$deprecated", "$extensions", "$extends", "$root"]),
	);
	const children: Record<string, TokenNode> = {};
	for (const [key, child] of Object.entries(value)) {
		if (key.startsWith("$")) continue;
		const childPath = `${path}/${escapePointer(key)}`;
		if (!isRecord(child)) {
			diagnostics.push({
				code: "invalid-group-child",
				path: childPath,
				message: "group children must be token or group objects",
			});
			continue;
		}
		if (own(child, "$value") || own(child, "$ref")) {
			const token = parseTokenEntry(child, childPath, diagnostics);
			if (token !== undefined) children[key] = token;
		} else {
			children[key] = parseGroup(child, childPath, diagnostics);
		}
	}
	return {
		kind: "group",
		...metadata,
		...(extendsTokens === undefined ? {} : { extends: extendsTokens }),
		...(root === undefined ? {} : { root }),
		children,
	};
};

const serializeValue = (value: TokenValue): TokenJsonValue => {
	switch (value.kind) {
		case "string":
			return value.value;
		case "number":
			return value.value;
		case "boolean":
			return value.value;
		case "null":
			return null;
		case "reference":
			return value.syntax === "json-pointer" ? { $ref: value.target } : value.authored;
		case "array":
			return value.items.map(serializeValue);
		case "object":
			return Object.fromEntries(
				Object.entries(value.entries).map(([key, entry]) => [key, serializeValue(entry)]),
			);
		case "contextual":
			throw new Error(
				"DTCG cannot serialize contextual values without an explicit context selection",
			);
	}
};

const isReferenceString = (value: unknown): value is string =>
	typeof value === "string" && /^\{[^{}]+\}$/u.test(value);

const isReferenceObject = (value: unknown): value is Record<string, string> =>
	isRecord(value) && Object.keys(value).length === 1 && typeof value.$ref === "string";

const isReferenceValue = (value: unknown): boolean =>
	isReferenceString(value) || isReferenceObject(value);

const validateKnownType = (
	type: string,
	value: TokenValue,
	path: string,
	diagnostics: TokenDiagnostic[],
): void => {
	if (value.kind === "reference") return;
	if (value.kind === "contextual") {
		for (const [context, contextValue] of Object.entries(value.values))
			validateKnownType(
				type,
				contextValue,
				`${path}/contexts/${escapePointer(context)}`,
				diagnostics,
			);
		return;
	}
	const jsonValue = serializeValue(value);
	const invalid = (message: string, diagnosticPath = path): void => {
		diagnostics.push({
			code: "invalid-typed-value",
			path: diagnosticPath,
			message: `DTCG ${type} value ${message}`,
		});
	};
	const record = isRecord(jsonValue) ? jsonValue : undefined;
	const hasReferenceField = (candidate: unknown): boolean => isReferenceValue(candidate);
	const rejectUnknownProperties = (
		candidate: Record<string, unknown>,
		allowed: readonly string[],
		objectPath: string,
	): void => {
		for (const key of Object.keys(candidate))
			if (!allowed.includes(key))
				invalid(`contains unsupported property '${key}'`, `${objectPath}/${escapePointer(key)}`);
	};
	const isFiniteNumber = (candidate: unknown): candidate is number =>
		typeof candidate === "number" && Number.isFinite(candidate);
	const validateColor = (candidate: unknown, colorPath: string): void => {
		if (hasReferenceField(candidate)) return;
		if (!isRecord(candidate)) {
			invalid("must be a Color object or reference", colorPath);
			return;
		}
		const colorSpace =
			typeof candidate.colorSpace === "string" && DTCG_COLOR_SPACES.has(candidate.colorSpace)
				? candidate.colorSpace
				: undefined;
		if (colorSpace === undefined && !hasReferenceField(candidate.colorSpace))
			invalid("uses an unsupported colorSpace", `${colorPath}/colorSpace`);
		if (!Array.isArray(candidate.components) || candidate.components.length !== 3) {
			invalid(
				"components must contain three numbers, 'none' values, or references",
				`${colorPath}/components`,
			);
		} else {
			candidate.components.forEach((component, index) => {
				if (!(isFiniteNumber(component) || component === "none" || hasReferenceField(component))) {
					invalid(
						"components must be numbers, 'none' values, or references",
						`${colorPath}/components/${index}`,
					);
					return;
				}
				const range =
					colorSpace === undefined ? undefined : DTCG_COLOR_COMPONENT_RANGES[colorSpace]?.[index];
				if (
					range !== undefined &&
					isFiniteNumber(component) &&
					(component < range[0] ||
						(range[2] === true ? component >= range[1] : component > range[1]))
				)
					invalid(
						`component must be in ${range[2] === true ? `[${range[0]}, ${range[1]})` : `[${range[0]}, ${range[1]}]`}`,
						`${colorPath}/components/${index}`,
					);
			});
		}
		if (
			candidate.alpha !== undefined &&
			!(
				(isFiniteNumber(candidate.alpha) && candidate.alpha >= 0 && candidate.alpha <= 1) ||
				hasReferenceField(candidate.alpha)
			)
		)
			invalid("alpha must be a number from 0 through 1 or a reference", `${colorPath}/alpha`);
		if (
			candidate.hex !== undefined &&
			!hasReferenceField(candidate.hex) &&
			(typeof candidate.hex !== "string" || !/^#[\da-f]{6}$/iu.test(candidate.hex))
		)
			invalid("hex must be a six-digit CSS hex string", `${colorPath}/hex`);
		rejectUnknownProperties(candidate, ["colorSpace", "components", "alpha", "hex"], colorPath);
	};
	const validateDimension = (candidate: unknown, dimensionPath: string): void => {
		if (hasReferenceField(candidate)) return;
		if (!isRecord(candidate)) {
			invalid("must be a dimension object or reference", dimensionPath);
			return;
		}
		if (!isFiniteNumber(candidate.value) && !hasReferenceField(candidate.value))
			invalid("value must be a finite number", `${dimensionPath}/value`);
		if (candidate.unit !== "px" && candidate.unit !== "rem" && !hasReferenceField(candidate.unit))
			invalid("unit must be px or rem", `${dimensionPath}/unit`);
		rejectUnknownProperties(candidate, ["value", "unit"], dimensionPath);
	};
	const validateDuration = (candidate: unknown, durationPath: string): void => {
		if (hasReferenceField(candidate)) return;
		if (!isRecord(candidate)) {
			invalid("must be a duration object or reference", durationPath);
			return;
		}
		if (!isFiniteNumber(candidate.value) && !hasReferenceField(candidate.value))
			invalid("value must be a finite number", `${durationPath}/value`);
		if (candidate.unit !== "ms" && candidate.unit !== "s" && !hasReferenceField(candidate.unit))
			invalid("unit must be ms or s", `${durationPath}/unit`);
		rejectUnknownProperties(candidate, ["value", "unit"], durationPath);
	};
	const validateCubicBezier = (candidate: unknown, bezierPath: string): void => {
		if (hasReferenceField(candidate)) return;
		if (
			!Array.isArray(candidate) ||
			candidate.length !== 4 ||
			!candidate.every(isFiniteNumber) ||
			candidate[0]! < 0 ||
			candidate[0]! > 1 ||
			candidate[2]! < 0 ||
			candidate[2]! > 1
		)
			invalid(
				"must be four numbers with x coordinates from 0 through 1 or a reference",
				bezierPath,
			);
	};
	const validateFontWeight = (candidate: unknown, weightPath: string): void => {
		if (hasReferenceField(candidate)) return;
		if (
			!(
				(isFiniteNumber(candidate) && candidate >= 1 && candidate <= 1000) ||
				(typeof candidate === "string" && DTCG_FONT_WEIGHT_NAMES.has(candidate))
			)
		)
			invalid("must be a predefined weight or a number from 1 through 1000", weightPath);
	};
	const validateStrokeStyle = (candidate: unknown, stylePath: string): void => {
		if (hasReferenceField(candidate)) return;
		if (
			(typeof candidate === "string" && DTCG_STROKE_STYLES.has(candidate)) ||
			hasReferenceField(candidate)
		)
			return;
		if (!isRecord(candidate)) {
			invalid("must be a predefined string, object, or reference", stylePath);
			return;
		}
		if (!Array.isArray(candidate.dashArray)) {
			invalid("dashArray must be a dimension array", `${stylePath}/dashArray`);
		} else {
			candidate.dashArray.forEach((item, index) =>
				validateDimension(item, `${stylePath}/dashArray/${index}`),
			);
		}
		if (
			(typeof candidate.lineCap !== "string" || !DTCG_LINE_CAPS.has(candidate.lineCap)) &&
			!hasReferenceField(candidate.lineCap)
		)
			invalid("lineCap must be round, butt, or square", `${stylePath}/lineCap`);
		rejectUnknownProperties(candidate, ["dashArray", "lineCap"], stylePath);
	};
	const validateShadowObject = (candidate: unknown, shadowPath: string): void => {
		if (!isRecord(candidate)) {
			invalid("must be a shadow object", shadowPath);
			return;
		}
		if (candidate.color === undefined) invalid("requires a color", `${shadowPath}/color`);
		else validateColor(candidate.color, `${shadowPath}/color`);
		for (const field of ["offsetX", "offsetY", "blur", "spread"] as const) {
			if (candidate[field] === undefined) invalid(`requires ${field}`, `${shadowPath}/${field}`);
			else validateDimension(candidate[field], `${shadowPath}/${field}`);
		}
		if (candidate.inset !== undefined && typeof candidate.inset !== "boolean")
			invalid("inset must be a boolean", `${shadowPath}/inset`);
		rejectUnknownProperties(
			candidate,
			["color", "offsetX", "offsetY", "blur", "spread", "inset"],
			shadowPath,
		);
	};
	switch (type) {
		case "color":
			validateColor(jsonValue, path);
			break;
		case "dimension":
			validateDimension(jsonValue, path);
			break;
		case "fontFamily":
			if (
				!(
					typeof jsonValue === "string" ||
					(Array.isArray(jsonValue) &&
						jsonValue.every((entry) => typeof entry === "string" || hasReferenceField(entry)))
				)
			)
				invalid("must be a font family string or string array");
			break;
		case "string":
			if (typeof jsonValue !== "string") invalid("must be a string");
			break;
		case "fontWeight":
			validateFontWeight(jsonValue, path);
			break;
		case "duration":
			validateDuration(jsonValue, path);
			break;
		case "cubicBezier":
			validateCubicBezier(jsonValue, path);
			break;
		case "number":
			if (typeof jsonValue !== "number" || !Number.isFinite(jsonValue))
				invalid("must be a finite number");
			break;
		case "strokeStyle":
			validateStrokeStyle(jsonValue, path);
			break;
		case "border":
			if (record === undefined) {
				invalid("must be a border object");
				break;
			}
			if (record.color === undefined) invalid("requires color", `${path}/color`);
			else validateColor(record.color, `${path}/color`);
			if (record.width === undefined) invalid("requires width", `${path}/width`);
			else validateDimension(record.width, `${path}/width`);
			if (record.style === undefined) invalid("requires style", `${path}/style`);
			else validateStrokeStyle(record.style, `${path}/style`);
			rejectUnknownProperties(record, ["color", "width", "style"], path);
			break;
		case "transition":
			if (record === undefined) {
				invalid("must be a transition object");
				break;
			}
			if (record.duration === undefined) invalid("requires duration", `${path}/duration`);
			else validateDuration(record.duration, `${path}/duration`);
			if (record.delay === undefined) invalid("requires delay", `${path}/delay`);
			else validateDuration(record.delay, `${path}/delay`);
			if (record.timingFunction === undefined)
				invalid("requires timingFunction", `${path}/timingFunction`);
			else validateCubicBezier(record.timingFunction, `${path}/timingFunction`);
			rejectUnknownProperties(record, ["duration", "delay", "timingFunction"], path);
			break;
		case "shadow":
			if (record !== undefined) validateShadowObject(record, path);
			else if (Array.isArray(jsonValue))
				jsonValue.forEach((item, index) => {
					if (hasReferenceField(item)) return;
					validateShadowObject(item, `${path}/${index}`);
				});
			else invalid("must be a shadow object, shadow array, or reference");
			break;
		case "gradient":
			if (!Array.isArray(jsonValue)) {
				invalid("must be an array of gradient stops or reference");
				break;
			}
			jsonValue.forEach((stop, index) => {
				const stopPath = `${path}/${index}`;
				if (hasReferenceField(stop)) return;
				if (!isRecord(stop)) {
					invalid("stop must be an object or reference", stopPath);
					return;
				}
				if (stop.color === undefined) invalid("stop requires color", `${stopPath}/color`);
				else validateColor(stop.color, `${stopPath}/color`);
				if (stop.position === undefined) invalid("stop requires position", `${stopPath}/position`);
				else if (!isFiniteNumber(stop.position) && !hasReferenceField(stop.position))
					invalid("position must be a number or reference", `${stopPath}/position`);
				rejectUnknownProperties(stop, ["color", "position"], stopPath);
			});
			break;
		case "typography":
			if (record === undefined) {
				invalid("must be a typography object");
				break;
			}
			if (record.fontFamily === undefined) invalid("requires fontFamily", `${path}/fontFamily`);
			else if (
				!(
					typeof record.fontFamily === "string" ||
					(Array.isArray(record.fontFamily) &&
						record.fontFamily.every((font) => typeof font === "string")) ||
					hasReferenceField(record.fontFamily)
				)
			)
				invalid("fontFamily must be a string or reference", `${path}/fontFamily`);
			if (record.fontSize === undefined) invalid("requires fontSize", `${path}/fontSize`);
			else validateDimension(record.fontSize, `${path}/fontSize`);
			if (record.fontWeight === undefined) invalid("requires fontWeight", `${path}/fontWeight`);
			else validateFontWeight(record.fontWeight, `${path}/fontWeight`);
			if (record.letterSpacing === undefined)
				invalid("requires letterSpacing", `${path}/letterSpacing`);
			else validateDimension(record.letterSpacing, `${path}/letterSpacing`);
			if (record.lineHeight === undefined) invalid("requires lineHeight", `${path}/lineHeight`);
			else if (!isFiniteNumber(record.lineHeight) && !hasReferenceField(record.lineHeight))
				invalid("lineHeight must be a number or reference", `${path}/lineHeight`);
			rejectUnknownProperties(
				record,
				["fontFamily", "fontSize", "fontWeight", "letterSpacing", "lineHeight"],
				path,
			);
			break;
		default:
			invalid("uses an unsupported token type");
	}
};

interface DtcgTokenRecord {
	readonly entry: TokenEntry;
	readonly name: string;
	readonly pointer: string;
	readonly group: DtcgGroupRecord;
	readonly path: string;
}

interface DtcgGroupRecord {
	readonly group: TokenGroup;
	readonly name: string;
	readonly pointer: string;
	readonly path: string;
	readonly parent?: DtcgGroupRecord;
	readonly raw: Record<string, unknown>;
}

const pointerKey = (segments: readonly string[]): string =>
	`/${segments.map(escapePointer).join("/")}`;

const dtcgPointerSegments = (reference: string): readonly string[] | undefined => {
	if (reference === "#") return [];
	if (!reference.startsWith("#/")) return undefined;
	try {
		return reference
			.slice(2)
			.split("/")
			.map((segment) => decodeURIComponent(segment).replaceAll("~1", "/").replaceAll("~0", "~"));
	} catch {
		return undefined;
	}
};

const valueAtDtcgPointer = (root: unknown, segments: readonly string[]): unknown => {
	let current = root;
	for (const segment of segments) {
		if (Array.isArray(current)) {
			if (!/^(0|[1-9]\d*)$/u.test(segment)) return undefined;
			current = current[Number(segment)];
		} else if (isRecord(current)) current = current[segment];
		else return undefined;
		if (current === undefined) return undefined;
	}
	return current;
};

const tokenNameForReference = (
	reference: Extract<TokenValue, { readonly kind: "reference" }>,
	tokensByName: ReadonlyMap<string, DtcgTokenRecord>,
	tokensByPointer: ReadonlyMap<string, DtcgTokenRecord>,
): DtcgTokenRecord | undefined => {
	if (reference.syntax === "curly") return tokensByName.get(reference.target);
	const segments = dtcgPointerSegments(reference.target);
	if (segments === undefined) return undefined;
	const candidates = [
		pointerKey(segments),
		...(segments.at(-1) === "$value" ? [pointerKey(segments.slice(0, -1))] : []),
	];
	for (const candidate of candidates) {
		const token = tokensByPointer.get(candidate);
		if (token !== undefined) return token;
	}
	for (let length = segments.length - 1; length > 0; length--) {
		const token = tokensByPointer.get(pointerKey(segments.slice(0, length)));
		if (token !== undefined) return token;
	}
	return undefined;
};

const validateDtcgDocument = (
	rawRoot: Record<string, unknown>,
	root: TokenGroup,
	diagnostics: TokenDiagnostic[],
): ReadonlyMap<TokenEntry, string> => {
	const groupsByName = new Map<string, DtcgGroupRecord>();
	const groupsByPointer = new Map<string, DtcgGroupRecord>();
	const tokensByName = new Map<string, DtcgTokenRecord>();
	const tokensByPointer = new Map<string, DtcgTokenRecord>();
	const groups: DtcgGroupRecord[] = [];
	const tokens: DtcgTokenRecord[] = [];
	const jsonPath = (segments: readonly string[]): string =>
		`/${segments.map(escapePointer).join("/")}`;
	const validName = (name: string, path: string): void => {
		if (name.startsWith("$") || /[.{}]/u.test(name))
			diagnostics.push({
				code: "invalid-token-name",
				path,
				message: "token and group names cannot start with '$' or contain '.', '{', or '}'",
			});
	};
	const validateRawNames = (value: Record<string, unknown>, segments: readonly string[]): void => {
		for (const [name, child] of Object.entries(value)) {
			if (name.startsWith("$")) continue;
			const childSegments = [...segments, name];
			validName(name, jsonPath(childSegments));
			if (isRecord(child) && !own(child, "$value") && !own(child, "$ref"))
				validateRawNames(child, childSegments);
		}
	};
	validateRawNames(rawRoot, []);
	const collect = (
		group: TokenGroup,
		raw: Record<string, unknown>,
		segments: readonly string[],
		parent?: DtcgGroupRecord,
	): void => {
		const path = segments.join(".");
		const record: DtcgGroupRecord = {
			group,
			name: path,
			pointer: pointerKey(segments),
			path: jsonPath(segments),
			raw,
			...(parent === undefined ? {} : { parent }),
		};
		groups.push(record);
		groupsByName.set(path, record);
		groupsByPointer.set(record.pointer, record);
		if (group.root !== undefined) {
			const name = [...segments, "$root"].join(".");
			const token: DtcgTokenRecord = {
				entry: group.root,
				name,
				pointer: pointerKey([...segments, "$root"]),
				group: record,
				path: `${jsonPath(segments)}/$root`,
			};
			tokens.push(token);
			tokensByName.set(name, token);
			tokensByPointer.set(token.pointer, token);
		}
		for (const [name, child] of Object.entries(group.children)) {
			const childSegments = [...segments, name];
			const childPath = jsonPath(childSegments);
			validName(name, childPath);
			if (child.kind === "token") {
				const tokenName = childSegments.join(".");
				const token: DtcgTokenRecord = {
					entry: child,
					name: tokenName,
					pointer: pointerKey(childSegments),
					group: record,
					path: childPath,
				};
				tokens.push(token);
				tokensByName.set(tokenName, token);
				tokensByPointer.set(token.pointer, token);
			} else {
				const rawChild = raw[name];
				if (isRecord(rawChild)) collect(child, rawChild, childSegments, record);
			}
		}
	};
	collect(root, rawRoot, []);
	const groupReference = (record: DtcgGroupRecord): DtcgGroupRecord | undefined => {
		const hasExtends = typeof record.raw.$extends === "string";
		const hasJsonReference = typeof record.raw.$ref === "string";
		if (hasExtends && hasJsonReference)
			diagnostics.push({
				code: "ambiguous-group-reference",
				path: record.path,
				message: "group cannot contain both $extends and $ref",
			});
		if (hasExtends) {
			const reference = String(record.raw.$extends);
			const match = /^\{([^{}]+)\}$/u.exec(reference);
			if (match === null) {
				diagnostics.push({
					code: "invalid-extends",
					path: `${record.path}/$extends`,
					message: "$extends must use a DTCG group reference such as {base}",
				});
				return undefined;
			}
			const target = groupsByName.get(match[1]!);
			if (target === undefined)
				diagnostics.push({
					code: "unresolved-group-reference",
					path: `${record.path}/$extends`,
					message: `group reference '${reference}' does not resolve to a group`,
				});
			return target;
		}
		if (hasJsonReference) {
			const reference = String(record.raw.$ref);
			const segments = dtcgPointerSegments(reference);
			if (segments === undefined) {
				diagnostics.push({
					code: "invalid-group-reference",
					path: `${record.path}/$ref`,
					message: "$ref must be a JSON Pointer fragment",
				});
				return undefined;
			}
			const target = groupsByPointer.get(pointerKey(segments));
			if (target === undefined)
				diagnostics.push({
					code: "unresolved-group-reference",
					path: `${record.path}/$ref`,
					message: `group reference '${reference}' does not resolve to a group`,
				});
			return target;
		}
		return undefined;
	};
	const groupTargets = new Map<DtcgGroupRecord, DtcgGroupRecord>();
	for (const group of groups) {
		const target = groupReference(group);
		if (target !== undefined) groupTargets.set(group, target);
	}
	const activeGroups = new Set<DtcgGroupRecord>();
	const visitedGroups = new Set<DtcgGroupRecord>();
	const visitGroupCycle = (group: DtcgGroupRecord): void => {
		if (activeGroups.has(group)) {
			diagnostics.push({
				code: "circular-group-reference",
				path: group.path,
				message: "group extensions cannot contain circular references",
			});
			return;
		}
		if (visitedGroups.has(group)) return;
		activeGroups.add(group);
		const target = groupTargets.get(group);
		if (target !== undefined) visitGroupCycle(target);
		activeGroups.delete(group);
		visitedGroups.add(group);
	};
	for (const group of groups) visitGroupCycle(group);

	const groupTypes = new Map<DtcgGroupRecord, string | undefined>();
	const resolveGroupType = (
		group: DtcgGroupRecord,
		active = new Set<DtcgGroupRecord>(),
	): string | undefined => {
		if (groupTypes.has(group)) return groupTypes.get(group);
		if (active.has(group)) return undefined;
		active.add(group);
		const type =
			group.group.type ??
			(groupTargets.has(group) ? resolveGroupType(groupTargets.get(group)!, active) : undefined) ??
			(group.parent === undefined ? undefined : resolveGroupType(group.parent, active));
		active.delete(group);
		groupTypes.set(group, type);
		if (group.group.type !== undefined && !DTCG_TOKEN_TYPES.has(group.group.type))
			diagnostics.push({
				code: "unsupported-token-type",
				path: `${group.path}/$type`,
				message: `unsupported DTCG token type '${group.group.type}'`,
			});
		return type;
	};
	for (const group of groups) resolveGroupType(group);

	const inferReferenceType = (
		reference: Extract<TokenValue, { readonly kind: "reference" }>,
		target: DtcgTokenRecord,
		getTokenType: (token: DtcgTokenRecord) => string | undefined,
	): string | undefined => {
		const tokenType = getTokenType(target);
		if (tokenType === undefined || reference.syntax !== "json-pointer") return tokenType;
		const referenceSegments = dtcgPointerSegments(reference.target);
		const tokenSegments = dtcgPointerSegments(`#${target.pointer}`);
		if (referenceSegments === undefined || tokenSegments === undefined) return tokenType;
		const valueSegments = [...tokenSegments, "$value"];
		if (
			referenceSegments.length <= valueSegments.length ||
			!valueSegments.every((segment, index) => referenceSegments[index] === segment)
		)
			return tokenType;
		const property = referenceSegments
			.slice(valueSegments.length)
			.findLast(
				(segment, index, segments) =>
					segment !== "contexts" &&
					segments[index - 1] !== "contexts" &&
					!/^(0|[1-9]\d*)$/u.test(segment),
			);
		return property === undefined
			? tokenType
			: (DTCG_COMPONENT_TYPES[tokenType]?.[property] ?? tokenType);
	};
	const tokenTypes = new Map<DtcgTokenRecord, string | undefined>();
	const activeTokens = new Set<DtcgTokenRecord>();
	const resolveTokenType = (token: DtcgTokenRecord): string | undefined => {
		if (tokenTypes.has(token)) return tokenTypes.get(token);
		if (activeTokens.has(token)) {
			diagnostics.push({
				code: "circular-token-reference",
				path: `${token.path}/$value`,
				message: "token references cannot be circular",
			});
			return undefined;
		}
		activeTokens.add(token);
		const inheritedType = resolveGroupType(token.group);
		let type = token.entry.type ?? inheritedType;
		if (type === undefined && token.entry.value.kind === "reference") {
			const target = tokenNameForReference(token.entry.value, tokensByName, tokensByPointer);
			if (target !== undefined)
				type = inferReferenceType(token.entry.value, target, resolveTokenType);
		}
		activeTokens.delete(token);
		tokenTypes.set(token, type);
		if (type === undefined)
			diagnostics.push({
				code: "missing-token-type",
				path: `${token.path}/$type`,
				message:
					"token type cannot be inferred; set $type, inherit it from a group, or reference a typed token",
			});
		else {
			if (!DTCG_TOKEN_TYPES.has(type))
				diagnostics.push({
					code: "unsupported-token-type",
					path: `${token.path}/$type`,
					message: `unsupported DTCG token type '${type}'`,
				});
			else validateKnownType(type, token.entry.value, `${token.path}/$value`, diagnostics);
		}
		return type;
	};
	for (const token of tokens) resolveTokenType(token);

	const referenceEdges = new Map<DtcgTokenRecord, Set<DtcgTokenRecord>>();
	const referenceType = (owner: DtcgTokenRecord, path: string): string | undefined => {
		const ownerType = tokenTypes.get(owner);
		if (ownerType === undefined) return undefined;
		const valueSegments = path.slice(owner.path.length).split("/").filter(Boolean).slice(1);
		const property = valueSegments.findLast(
			(segment, index) =>
				segment !== "contexts" &&
				valueSegments[index - 1] !== "contexts" &&
				!/^\d+$/u.test(segment),
		);
		return property === undefined
			? ownerType
			: (DTCG_COMPONENT_TYPES[ownerType]?.[property] ?? ownerType);
	};
	const visitValue = (owner: DtcgTokenRecord, value: TokenValue, path: string): void => {
		if (value.kind === "reference") {
			let target: DtcgTokenRecord | undefined;
			if (value.syntax === "curly") {
				target = tokensByName.get(value.target);
				if (target === undefined)
					diagnostics.push({
						code: "unresolved-token-reference",
						path,
						message: `token reference '${value.authored}' does not resolve to a token`,
					});
			} else {
				const segments = dtcgPointerSegments(value.target);
				if (segments === undefined || valueAtDtcgPointer(rawRoot, segments) === undefined)
					diagnostics.push({
						code: "unresolved-token-reference",
						path,
						message: `JSON Pointer reference '${value.authored}' does not resolve within this document`,
					});
				target = tokenNameForReference(value, tokensByName, tokensByPointer);
			}
			if (target !== undefined) {
				const edges = referenceEdges.get(owner) ?? new Set<DtcgTokenRecord>();
				edges.add(target);
				referenceEdges.set(owner, edges);
				const targetType = inferReferenceType(value, target, resolveTokenType);
				const expectedType = referenceType(owner, path);
				if (expectedType !== undefined && targetType !== undefined && expectedType !== targetType)
					diagnostics.push({
						code: "reference-type-mismatch",
						path,
						message: `reference type '${targetType}' does not match expected type '${expectedType}'`,
					});
			}
			return;
		}
		if (value.kind === "array")
			value.items.forEach((item, index) => visitValue(owner, item, `${path}/${index}`));
		if (value.kind === "object")
			Object.entries(value.entries).forEach(([key, item]) =>
				visitValue(owner, item, `${path}/${escapePointer(key)}`),
			);
		if (value.kind === "contextual")
			Object.entries(value.values).forEach(([context, item]) =>
				visitValue(owner, item, `${path}/contexts/${escapePointer(context)}`),
			);
	};
	for (const token of tokens) visitValue(token, token.entry.value, `${token.path}/$value`);
	const activeReferences = new Set<DtcgTokenRecord>();
	const visitedReferences = new Set<DtcgTokenRecord>();
	const visitReferenceCycle = (token: DtcgTokenRecord): void => {
		if (activeReferences.has(token)) {
			diagnostics.push({
				code: "circular-token-reference",
				path: `${token.path}/$value`,
				message: "token references cannot be circular",
			});
			return;
		}
		if (visitedReferences.has(token)) return;
		activeReferences.add(token);
		for (const target of referenceEdges.get(token) ?? []) visitReferenceCycle(target);
		activeReferences.delete(token);
		visitedReferences.add(token);
	};
	for (const token of tokens) visitReferenceCycle(token);

	const effectiveTypes = new Map<TokenEntry, string>();
	for (const token of tokens) {
		const type = tokenTypes.get(token);
		if (type !== undefined) effectiveTypes.set(token.entry, type);
	}
	return effectiveTypes;
};

const attachEffectiveTypes = (
	group: TokenGroup,
	effectiveTypes: ReadonlyMap<TokenEntry, string>,
): TokenGroup => ({
	...group,
	...(group.root === undefined
		? {}
		: {
				root: {
					...group.root,
					...(effectiveTypes.has(group.root)
						? { effectiveType: effectiveTypes.get(group.root) }
						: {}),
				},
			}),
	children: Object.fromEntries(
		Object.entries(group.children).map(([name, child]) => [
			name,
			child.kind === "token"
				? {
						...child,
						...(effectiveTypes.has(child) ? { effectiveType: effectiveTypes.get(child) } : {}),
					}
				: attachEffectiveTypes(child, effectiveTypes),
		]),
	),
});

const parseModelValue = (
	value: unknown,
	path: string,
	diagnostics: TokenDiagnostic[],
): TokenValue | undefined => {
	if (!isRecord(value) || typeof value.kind !== "string") {
		diagnostics.push({
			code: "invalid-token-model-value",
			path,
			message: "tagged token value is required",
		});
		return undefined;
	}
	switch (value.kind) {
		case "string":
			if (typeof value.value === "string") return { kind: "string", value: value.value };
			break;
		case "number":
			if (typeof value.value === "number" && Number.isFinite(value.value))
				return { kind: "number", value: value.value };
			break;
		case "boolean":
			if (typeof value.value === "boolean") return { kind: "boolean", value: value.value };
			break;
		case "null":
			return { kind: "null" };
		case "reference":
			if (
				(value.syntax === "curly" || value.syntax === "json-pointer") &&
				typeof value.target === "string" &&
				typeof value.authored === "string"
			)
				return {
					kind: "reference",
					syntax: value.syntax,
					target: value.target,
					authored: value.authored,
				};
			break;
		case "array":
			if (Array.isArray(value.items)) {
				const items = value.items.map((item, index) =>
					parseModelValue(item, `${path}/items/${index}`, diagnostics),
				);
				if (items.every((item) => item !== undefined))
					return {
						kind: "array",
						items: items.flatMap((item) => (item === undefined ? [] : [item])),
					};
			}
			break;
		case "object":
			if (isRecord(value.entries)) {
				const entries: Record<string, TokenValue> = {};
				for (const [key, item] of Object.entries(value.entries)) {
					const parsed = parseModelValue(
						item,
						`${path}/entries/${escapePointer(key)}`,
						diagnostics,
					);
					if (parsed !== undefined) entries[key] = parsed;
				}
				if (Object.keys(entries).length === Object.keys(value.entries).length)
					return { kind: "object", entries };
			}
			break;
		case "contextual":
			if (
				typeof value.source === "string" &&
				value.source.length > 0 &&
				isRecord(value.values) &&
				Object.keys(value.values).length > 0
			) {
				const values: Record<string, TokenValue> = {};
				for (const [context, item] of Object.entries(value.values)) {
					const parsed = parseModelValue(
						item,
						`${path}/values/${escapePointer(context)}`,
						diagnostics,
					);
					if (parsed !== undefined) values[context] = parsed;
				}
				if (Object.keys(values).length === Object.keys(value.values).length)
					return { kind: "contextual", source: value.source, values };
			}
			break;
	}
	diagnostics.push({
		code: "invalid-token-model-value",
		path,
		message: `invalid tagged token value '${value.kind}'`,
	});
	return undefined;
};

const parseModelMetadata = (
	value: Record<string, unknown>,
	path: string,
	diagnostics: TokenDiagnostic[],
): TokenMetadata => {
	const metadata: {
		type?: string;
		description?: string;
		deprecated?: boolean | string;
		extensions?: Readonly<Record<string, TokenJsonValue>>;
		sourceMetadata?: Readonly<Record<string, TokenJsonValue>>;
	} = {};
	if (value.type !== undefined) {
		if (typeof value.type === "string") metadata.type = value.type;
		else
			diagnostics.push({
				code: "invalid-token-model-metadata",
				path: `${path}/type`,
				message: "type must be a string",
			});
	}
	if (value.description !== undefined) {
		if (typeof value.description === "string") metadata.description = value.description;
		else
			diagnostics.push({
				code: "invalid-token-model-metadata",
				path: `${path}/description`,
				message: "description must be a string",
			});
	}
	if (value.deprecated !== undefined) {
		if (typeof value.deprecated === "boolean" || typeof value.deprecated === "string")
			metadata.deprecated = value.deprecated;
		else
			diagnostics.push({
				code: "invalid-token-model-metadata",
				path: `${path}/deprecated`,
				message: "deprecated must be a boolean or string",
			});
	}
	if (value.extensions !== undefined) {
		if (jsonRecord(value.extensions)) metadata.extensions = value.extensions;
		else
			diagnostics.push({
				code: "invalid-token-model-metadata",
				path: `${path}/extensions`,
				message: "extensions must be a JSON object",
			});
	}
	if (value.sourceMetadata !== undefined) {
		if (jsonRecord(value.sourceMetadata)) metadata.sourceMetadata = value.sourceMetadata;
		else
			diagnostics.push({
				code: "invalid-token-model-metadata",
				path: `${path}/sourceMetadata`,
				message: "source metadata must be a JSON object",
			});
	}
	return metadata;
};

const parseModelEntry = (
	value: unknown,
	path: string,
	diagnostics: TokenDiagnostic[],
): TokenEntry | undefined => {
	if (!isRecord(value) || value.kind !== "token") {
		diagnostics.push({
			code: "invalid-token-model-entry",
			path,
			message: "token node must have kind 'token'",
		});
		return undefined;
	}
	const metadata = parseModelMetadata(value, path, diagnostics);
	const effectiveType = value.effectiveType;
	if (effectiveType !== undefined && typeof effectiveType !== "string")
		diagnostics.push({
			code: "invalid-token-model-metadata",
			path: `${path}/effectiveType`,
			message: "effectiveType must be a string",
		});
	const tokenValue = parseModelValue(value.value, `${path}/value`, diagnostics);
	return tokenValue === undefined
		? undefined
		: {
				kind: "token",
				...metadata,
				...(typeof effectiveType === "string" ? { effectiveType } : {}),
				value: tokenValue,
			};
};

const parseModelGroup = (
	value: unknown,
	path: string,
	diagnostics: TokenDiagnostic[],
): TokenGroup | undefined => {
	if (!isRecord(value) || value.kind !== "group" || !isRecord(value.children)) {
		diagnostics.push({
			code: "invalid-token-model-group",
			path,
			message: "group node must have kind 'group' and an object of children",
		});
		return undefined;
	}
	const metadata = parseModelMetadata(value, path, diagnostics);
	const children: Record<string, TokenNode> = {};
	for (const [key, child] of Object.entries(value.children)) {
		const childPath = `${path}/children/${escapePointer(key)}`;
		if (!isRecord(child)) {
			diagnostics.push({
				code: "invalid-token-model-child",
				path: childPath,
				message: "child must be a token or group",
			});
			continue;
		}
		const node =
			child.kind === "token"
				? parseModelEntry(child, childPath, diagnostics)
				: parseModelGroup(child, childPath, diagnostics);
		if (node !== undefined) children[key] = node;
	}
	let root: TokenEntry | undefined;
	if (value.root !== undefined) root = parseModelEntry(value.root, `${path}/root`, diagnostics);
	let extendsTokens: string | readonly string[] | undefined;
	if (value.extends !== undefined) {
		if (typeof value.extends === "string") extendsTokens = value.extends;
		else if (
			Array.isArray(value.extends) &&
			value.extends.every((entry) => typeof entry === "string")
		)
			extendsTokens = value.extends;
		else
			diagnostics.push({
				code: "invalid-token-model-extends",
				path: `${path}/extends`,
				message: "extends must be a reference or reference array",
			});
	}
	return {
		kind: "group",
		...metadata,
		...(extendsTokens === undefined ? {} : { extends: extendsTokens }),
		...(root === undefined ? {} : { root }),
		children,
	};
};

const parseResolverModel = (value: unknown): TokenResolverDocument => {
	if (
		!isRecord(value) ||
		value.schema !== TOKEN_RESOLVER_SCHEMA ||
		typeof value.version !== "string" ||
		!isRecord(value.sets) ||
		!isRecord(value.modifiers) ||
		!Array.isArray(value.resolutionOrder)
	)
		throw new TokenDocumentValidationError([
			{
				code: "invalid-resolver-model",
				path: "/resolver",
				message: "resolver must use yumcss.token-resolver/1",
			},
		]);
	const sets: Record<string, TokenResolverSet> = {};
	for (const [id, set] of Object.entries(value.sets)) {
		if (
			!isRecord(set) ||
			!Array.isArray(set.sources) ||
			!set.sources.every((source) => JsonValueSchema.safeParse(source).success)
		)
			throw new TokenDocumentValidationError([
				{
					code: "invalid-resolver-model-set",
					path: `/resolver/sets/${escapePointer(id)}`,
					message: "set sources must be JSON-compatible values",
				},
			]);
		sets[id] = {
			sources: set.sources.map((source) => JsonValueSchema.parse(source)),
			...(jsonRecord(set.sourceMetadata) ? { sourceMetadata: set.sourceMetadata } : {}),
		};
	}
	const modifiers: Record<string, TokenResolverModifier> = {};
	for (const [id, modifier] of Object.entries(value.modifiers)) {
		if (!isRecord(modifier) || !isRecord(modifier.contexts))
			throw new TokenDocumentValidationError([
				{
					code: "invalid-resolver-model-modifier",
					path: `/resolver/modifiers/${escapePointer(id)}`,
					message: "modifier contexts must be an object",
				},
			]);
		const contexts: Record<string, readonly TokenJsonValue[]> = {};
		for (const [context, sources] of Object.entries(modifier.contexts)) {
			if (
				!Array.isArray(sources) ||
				!sources.every((source) => JsonValueSchema.safeParse(source).success)
			)
				throw new TokenDocumentValidationError([
					{
						code: "invalid-resolver-model-context",
						path: `/resolver/modifiers/${escapePointer(id)}/contexts/${escapePointer(context)}`,
						message: "context sources must be JSON-compatible arrays",
					},
				]);
			contexts[context] = sources.map((source) => JsonValueSchema.parse(source));
		}
		if (modifier.default !== undefined && typeof modifier.default !== "string")
			throw new TokenDocumentValidationError([
				{
					code: "invalid-resolver-model-default",
					path: `/resolver/modifiers/${escapePointer(id)}/default`,
					message: "default context must be a string",
				},
			]);
		modifiers[id] = {
			contexts,
			...(modifier.default === undefined ? {} : { default: modifier.default }),
			...(jsonRecord(modifier.sourceMetadata) ? { sourceMetadata: modifier.sourceMetadata } : {}),
		};
	}
	if (!value.resolutionOrder.every((entry) => JsonValueSchema.safeParse(entry).success))
		throw new TokenDocumentValidationError([
			{
				code: "invalid-resolver-model-order",
				path: "/resolver/resolutionOrder",
				message: "resolutionOrder must contain JSON reference or inline operation objects",
			},
		]);
	const resolutionOrder = value.resolutionOrder.map((entry) => JsonValueSchema.parse(entry));
	return {
		schema: TOKEN_RESOLVER_SCHEMA,
		version: value.version,
		...(typeof value.name === "string" ? { name: value.name } : {}),
		...(typeof value.description === "string" ? { description: value.description } : {}),
		sets,
		modifiers,
		resolutionOrder,
		...(jsonRecord(value.sourceMetadata) ? { sourceMetadata: value.sourceMetadata } : {}),
		...(JsonValueSchema.safeParse(value.sourceDocument).success
			? { sourceDocument: JsonValueSchema.parse(value.sourceDocument) }
			: {}),
	};
};

const validateDocumentShape = (value: unknown): TokenDocument => {
	const envelope = TokenDocumentEnvelopeSchema.safeParse(value);
	if (!envelope.success) {
		throw new TokenDocumentValidationError(
			envelope.error.issues.map((issue) => ({
				code: "invalid-token-document",
				path: `/${issue.path.join("/")}`,
				message: issue.message,
			})),
		);
	}
	const diagnostics: TokenDiagnostic[] = [];
	const root = parseModelGroup(envelope.data.root, "", diagnostics);
	if (diagnostics.length > 0 || root === undefined)
		throw new TokenDocumentValidationError(diagnostics);
	const resolver =
		envelope.data.resolver === undefined ? undefined : parseResolverModel(envelope.data.resolver);
	return {
		schema: TOKEN_DOCUMENT_SCHEMA,
		format: envelope.data.format,
		formatVersion: envelope.data.formatVersion,
		sourceFingerprint: envelope.data.sourceFingerprint,
		...(envelope.data.sourceLosses === undefined
			? {}
			: { sourceLosses: envelope.data.sourceLosses }),
		root,
		...(resolver === undefined ? {} : { resolver }),
	};
};

export const createTokenDocument = (options: {
	readonly format: TokenFormatIdValue;
	readonly formatVersion?: string;
	readonly root?: TokenGroup;
	readonly resolver?: TokenResolverDocument;
	readonly sourceLosses?: readonly TokenFormatLoss[];
	readonly sourceText?: string;
}): TokenDocument =>
	validateDocumentShape({
		schema: TOKEN_DOCUMENT_SCHEMA,
		format: options.format,
		formatVersion: options.formatVersion ?? "unknown",
		sourceFingerprint: hashText(
			options.sourceText ?? JSON.stringify(options.root ?? { kind: "group", children: {} }),
		),
		...(options.sourceLosses === undefined ? {} : { sourceLosses: options.sourceLosses }),
		root: options.root ?? { kind: "group", children: {} },
		...(options.resolver === undefined ? {} : { resolver: options.resolver }),
	});

export const parseTokenDocument = (value: unknown): TokenDocument => validateDocumentShape(value);

export const parseDtcgTokenDocument = (text: string): TokenDocument => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		throw new TokenDocumentValidationError([
			{
				code: "invalid-json",
				path: "",
				message: error instanceof Error ? error.message : "input is not valid JSON",
			},
		]);
	}
	if (!isRecord(parsed))
		throw new TokenDocumentValidationError([
			{ code: "invalid-root", path: "", message: "DTCG token document root must be an object" },
		]);
	const diagnostics: TokenDiagnostic[] = [];
	const parsedRoot = parseGroup(parsed, "", diagnostics);
	const effectiveTypes = validateDtcgDocument(parsed, parsedRoot, diagnostics);
	if (diagnostics.length > 0) throw new TokenDocumentValidationError(diagnostics);
	const root = attachEffectiveTypes(parsedRoot, effectiveTypes);
	return createTokenDocument({
		format: TokenFormatId.Dtcg,
		formatVersion: "2025.10",
		root,
		sourceText: text,
	});
};

export const serializeDtcgTokenDocument = (document: TokenDocument): string => {
	const validated = parseTokenDocument(document);
	return serializeValidatedDtcgTokenDocument(validated);
};

const resolverSourceSchema = JsonValueSchema;
const resolverSetSchema = z
	.object({
		sources: z.array(resolverSourceSchema),
		description: z.string().optional(),
	})
	.passthrough();
const resolverModifierSchema = z
	.object({
		contexts: z
			.record(z.string(), z.array(resolverSourceSchema))
			.refine((contexts) => Object.keys(contexts).length > 0),
		default: z.string().optional(),
		description: z.string().optional(),
	})
	.passthrough();
const resolverDocumentSchema = z
	.object({
		version: z.literal("2025.10"),
		name: z.string().optional(),
		description: z.string().optional(),
		sets: z.record(z.string(), resolverSetSchema).default({}),
		modifiers: z.record(z.string(), resolverModifierSchema).default({}),
		resolutionOrder: z.array(resolverSourceSchema).min(1),
	})
	.passthrough();

export const parseTokenResolverDocument = (value: unknown): TokenResolverDocument => {
	const result = resolverDocumentSchema.safeParse(value);
	if (!result.success) {
		throw new TokenDocumentValidationError(
			result.error.issues.map((issue) => ({
				code: "invalid-resolver-document",
				path: `/${issue.path.join("/")}`,
				message: issue.message,
			})),
		);
	}
	const diagnostics: TokenDiagnostic[] = [];
	const validateSource = (source: TokenJsonValue, path: string): void => {
		if (!isRecord(source)) {
			diagnostics.push({
				code: "invalid-resolver-source",
				path,
				message: "token source must be an inline document or a $ref object",
			});
			return;
		}
		if (Object.hasOwn(source, "$ref")) {
			if (typeof source.$ref !== "string" || Object.keys(source).length !== 1) {
				diagnostics.push({
					code: "invalid-resolver-reference",
					path,
					message: "reference object must contain only a non-empty $ref string",
				});
			} else if (source.$ref.length === 0) {
				diagnostics.push({
					code: "invalid-resolver-reference",
					path: `${path}/$ref`,
					message: "$ref must not be empty",
				});
			}
		}
	};
	for (const [id, set] of Object.entries(result.data.sets)) {
		set.sources.forEach((source, index) =>
			validateSource(source, `/sets/${escapePointer(id)}/sources/${index}`),
		);
	}
	for (const [id, modifier] of Object.entries(result.data.modifiers)) {
		if (modifier.default !== undefined && !Object.hasOwn(modifier.contexts, modifier.default)) {
			diagnostics.push({
				code: "invalid-resolver-default",
				path: `/modifiers/${escapePointer(id)}/default`,
				message: "default must name a declared context",
			});
		}
		for (const [context, sources] of Object.entries(modifier.contexts)) {
			sources.forEach((source, index) =>
				validateSource(
					source,
					`/modifiers/${escapePointer(id)}/contexts/${escapePointer(context)}/${index}`,
				),
			);
		}
	}
	const inlineNames = new Set<string>();
	for (const [index, operation] of result.data.resolutionOrder.entries()) {
		const path = `/resolutionOrder/${index}`;
		if (!isRecord(operation)) {
			diagnostics.push({
				code: "invalid-resolver-order-item",
				path,
				message: "resolution order items must be a reference, inline set, or inline modifier",
			});
			continue;
		}
		if (Object.hasOwn(operation, "$ref")) {
			validateSource(operation as TokenJsonValue, path);
			if (typeof operation.$ref === "string" && operation.$ref.startsWith("#/resolutionOrder/")) {
				diagnostics.push({
					code: "invalid-resolver-order-reference",
					path,
					message: "resolution order items must not reference resolutionOrder entries",
				});
			}
			continue;
		}
		const type = operation.type;
		const name = operation.name;
		if ((type !== "set" && type !== "modifier") || typeof name !== "string" || name.length === 0) {
			diagnostics.push({
				code: "invalid-resolver-inline-order-item",
				path,
				message: "inline order items require type 'set' or 'modifier' and a non-empty name",
			});
			continue;
		}
		if (inlineNames.has(name)) {
			diagnostics.push({
				code: "duplicate-resolver-inline-name",
				path: `${path}/name`,
				message: `inline resolution name '${name}' is duplicated`,
			});
		}
		inlineNames.add(name);
		if (type === "set") {
			const inlineSet = resolverSetSchema.safeParse(operation);
			if (!inlineSet.success)
				diagnostics.push({
					code: "invalid-resolver-inline-set",
					path,
					message: "inline set requires a sources array",
				});
			else
				inlineSet.data.sources.forEach((source, sourceIndex) =>
					validateSource(source, `${path}/sources/${sourceIndex}`),
				);
		} else {
			const inlineModifier = resolverModifierSchema.safeParse(operation);
			if (!inlineModifier.success) {
				diagnostics.push({
					code: "invalid-resolver-inline-modifier",
					path,
					message: "inline modifier requires a non-empty contexts map",
				});
			} else {
				if (
					inlineModifier.data.default !== undefined &&
					!Object.hasOwn(inlineModifier.data.contexts, inlineModifier.data.default)
				)
					diagnostics.push({
						code: "invalid-resolver-inline-default",
						path: `${path}/default`,
						message: "default must name a declared context",
					});
				for (const [context, sources] of Object.entries(inlineModifier.data.contexts))
					sources.forEach((source, sourceIndex) =>
						validateSource(source, `${path}/contexts/${escapePointer(context)}/${sourceIndex}`),
					);
			}
		}
	}
	if (diagnostics.length > 0) throw new TokenDocumentValidationError(diagnostics);
	const known = new Set(["version", "name", "description", "sets", "modifiers", "resolutionOrder"]);
	const sourceMetadata = Object.fromEntries(
		Object.entries(value as Record<string, unknown>).filter(([key]) => !known.has(key)),
	) as Record<string, TokenJsonValue>;
	const sets = Object.fromEntries(
		Object.entries(result.data.sets).map(([id, set]) => {
			const { sources, ...rest } = set;
			return [
				id,
				{
					sources,
					...(Object.keys(rest).length === 0
						? {}
						: { sourceMetadata: rest as Record<string, TokenJsonValue> }),
				},
			];
		}),
	);
	const modifiers = Object.fromEntries(
		Object.entries(result.data.modifiers).map(([id, modifier]) => {
			const contexts = modifier.contexts;
			const { contexts: _contexts, default: defaultContext, ...rest } = modifier;
			return [
				id,
				{
					contexts,
					...(defaultContext === undefined ? {} : { default: defaultContext }),
					...(Object.keys(rest).length === 0
						? {}
						: { sourceMetadata: rest as Record<string, TokenJsonValue> }),
				},
			];
		}),
	);
	return {
		schema: TOKEN_RESOLVER_SCHEMA,
		version: result.data.version,
		...(result.data.name === undefined ? {} : { name: result.data.name }),
		...(result.data.description === undefined ? {} : { description: result.data.description }),
		sets,
		modifiers,
		resolutionOrder: result.data.resolutionOrder,
		...(Object.keys(sourceMetadata).length === 0 ? {} : { sourceMetadata }),
		sourceDocument: JsonValueSchema.parse(value),
	};
};

export const parseDtcgResolverDocument = (text: string): TokenResolverDocument => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		throw new TokenDocumentValidationError([
			{
				code: "invalid-resolver-json",
				path: "",
				message: error instanceof Error ? error.message : "resolver input is not valid JSON",
			},
		]);
	}
	return parseTokenResolverDocument(parsed);
};

export const serializeTokenResolverDocument = (resolver: TokenResolverDocument): string =>
	serializeValidatedTokenResolverDocument(resolver);

const mapTokenValue = (
	value: TokenValue,
	selection: TokenContextSelection,
	path: string,
): TokenValue => {
	if (value.kind === "contextual") {
		const context = selection.contexts[value.source];
		if (context === undefined)
			throw new Error(`token context selection required for '${value.source}' at ${path}`);
		const selected = value.values[context];
		if (selected === undefined)
			throw new Error(`unknown token context '${context}' for '${value.source}' at ${path}`);
		return mapTokenValue(selected, selection, path);
	}
	if (value.kind === "array")
		return {
			kind: "array",
			items: value.items.map((item, index) => mapTokenValue(item, selection, `${path}/${index}`)),
		};
	if (value.kind === "object")
		return {
			kind: "object",
			entries: Object.fromEntries(
				Object.entries(value.entries).map(([key, entry]) => [
					key,
					mapTokenValue(entry, selection, `${path}/${escapePointer(key)}`),
				]),
			),
		};
	return value;
};

const resolveGroupInlineContexts = (
	group: TokenGroup,
	selection: TokenContextSelection,
	path: readonly string[],
): TokenGroup => ({
	...group,
	...(group.root === undefined
		? {}
		: {
				root: {
					...group.root,
					value: mapTokenValue(
						group.root.value,
						selection,
						`/${[...path, "$root", "$value"].join("/")}`,
					),
				},
			}),
	children: Object.fromEntries(
		Object.entries(group.children).map(([name, child]) => [
			name,
			child.kind === "token"
				? {
						...child,
						value: mapTokenValue(child.value, selection, `/${[...path, name, "$value"].join("/")}`),
					}
				: resolveGroupInlineContexts(child, selection, [...path, name]),
		]),
	),
});

const containsContextualValue = (value: TokenValue): boolean => {
	if (value.kind === "contextual") return true;
	if (value.kind === "array") return value.items.some(containsContextualValue);
	if (value.kind === "object") return Object.values(value.entries).some(containsContextualValue);
	return false;
};

const groupContainsContextualValue = (group: TokenGroup): boolean =>
	(group.root !== undefined && containsContextualValue(group.root.value)) ||
	Object.values(group.children).some((child) =>
		child.kind === "token"
			? containsContextualValue(child.value)
			: groupContainsContextualValue(child),
	);

export const tokenDocumentHasContextualValues = (document: TokenDocument): boolean =>
	groupContainsContextualValue(document.root);

export const resolveInlineTokenContext = (
	document: TokenDocument,
	selection: TokenContextSelection,
): TokenDocument => {
	if (!tokenDocumentHasContextualValues(document)) return document;
	const root = resolveGroupInlineContexts(document.root, selection, []);
	return createTokenDocument({
		format: document.format,
		formatVersion: document.formatVersion,
		root,
		...(document.resolver === undefined ? {} : { resolver: document.resolver }),
		sourceLosses: document.sourceLosses,
		sourceText: `${document.sourceFingerprint}:${JSON.stringify(selection.contexts)}`,
	});
};

const mergeGroups = (base: TokenGroup, overlay: TokenGroup): TokenGroup => ({
	...base,
	...overlay,
	children: Object.fromEntries(
		[...new Set([...Object.keys(base.children), ...Object.keys(overlay.children)])].map((key) => {
			const before = base.children[key];
			const after = overlay.children[key];
			return [
				key,
				before?.kind === "group" && after?.kind === "group"
					? mergeGroups(before, after)
					: (after ?? before!),
			];
		}),
	),
});

const resolverReference = (value: TokenJsonValue): string | undefined =>
	isRecord(value) && typeof value.$ref === "string" ? value.$ref : undefined;

const pointerSegments = (reference: string): readonly string[] | undefined => {
	if (!reference.startsWith("#/")) return undefined;
	return reference
		.slice(2)
		.split("/")
		.map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
};

const valueAtPointer = (
	value: TokenJsonValue,
	segments: readonly string[],
): TokenJsonValue | undefined => {
	let current: TokenJsonValue | undefined = value;
	for (const segment of segments) {
		if (Array.isArray(current)) {
			const index = Number(segment);
			current = Number.isInteger(index) ? current[index] : undefined;
		} else if (isRecord(current)) {
			const next = current[segment];
			current = JsonValueSchema.safeParse(next).success ? JsonValueSchema.parse(next) : undefined;
		} else return undefined;
		if (current === undefined) return undefined;
	}
	return current;
};

const readResolverSource = async (
	source: TokenJsonValue,
	resolver: TokenResolverDocument,
	loader: TokenSourceLoader,
	activeSets: ReadonlySet<string> = new Set(),
): Promise<readonly TokenDocument[]> => {
	const reference = resolverReference(source);
	if (reference !== undefined) {
		const segments = pointerSegments(reference);
		if (segments !== undefined) {
			if (segments[0] === "sets" && segments.length === 2) {
				const setId = segments[1]!;
				const set = resolver.sets[setId];
				if (set === undefined) throw new Error(`unknown resolver set reference '${reference}'`);
				if (activeSets.has(setId))
					throw new Error(`circular resolver set reference '${reference}'`);
				const nextActive = new Set(activeSets).add(setId);
				const documents = await Promise.all(
					set.sources.map((entry) => readResolverSource(entry, resolver, loader, nextActive)),
				);
				return documents.flat();
			}
			const sourceDocument = resolver.sourceDocument;
			const pointed =
				sourceDocument === undefined ? undefined : valueAtPointer(sourceDocument, segments);
			if (pointed === undefined)
				throw new Error(`resolver reference '${reference}' does not resolve`);
			if (isRecord(pointed) && Array.isArray(pointed.sources)) {
				const set = parseTokenResolverDocument({
					version: resolver.version,
					sets: { referenced: pointed },
					modifiers: {},
					resolutionOrder: [{ $ref: "#/sets/referenced" }],
				});
				return readResolverSource({ $ref: "#/sets/referenced" }, set, loader, activeSets);
			}
			if (loader.parseInline !== undefined) return [await loader.parseInline(pointed)];
			return [parseDtcgTokenDocument(JSON.stringify(pointed))];
		}
		return [await loader.load(reference)];
	}
	if (!isRecord(source))
		throw new Error("resolver token source must be an inline document or reference object");
	if (loader.parseInline !== undefined) return [await loader.parseInline(source)];
	return [parseDtcgTokenDocument(JSON.stringify(source))];
};

interface ResolverOperation {
	readonly kind: "set" | "modifier";
	readonly name: string;
	readonly sources?: readonly TokenJsonValue[];
	readonly contexts?: Readonly<Record<string, readonly TokenJsonValue[]>>;
	readonly default?: string;
}

const resolverOperation = (
	item: TokenJsonValue,
	resolver: TokenResolverDocument,
): ResolverOperation | undefined => {
	const reference = resolverReference(item);
	if (reference !== undefined) {
		const segments = pointerSegments(reference);
		if (segments === undefined || segments.length !== 2) return undefined;
		const [kind, name] = segments;
		if (kind === "sets") {
			const set = resolver.sets[name!];
			return set === undefined ? undefined : { kind: "set", name: name!, sources: set.sources };
		}
		if (kind === "modifiers") {
			const modifier = resolver.modifiers[name!];
			return modifier === undefined
				? undefined
				: {
						kind: "modifier",
						name: name!,
						contexts: modifier.contexts,
						...(modifier.default === undefined ? {} : { default: modifier.default }),
					};
		}
		return undefined;
	}
	if (
		!isRecord(item) ||
		(item.type !== "set" && item.type !== "modifier") ||
		typeof item.name !== "string"
	)
		return undefined;
	if (item.type === "set" && Array.isArray(item.sources))
		return { kind: "set", name: item.name, sources: item.sources as TokenJsonValue[] };
	if (item.type === "modifier" && isRecord(item.contexts)) {
		const contexts = Object.fromEntries(
			Object.entries(item.contexts).filter(([, value]) => Array.isArray(value)),
		) as Record<string, readonly TokenJsonValue[]>;
		return {
			kind: "modifier",
			name: item.name,
			contexts,
			...(typeof item.default === "string" ? { default: item.default } : {}),
		};
	}
	return undefined;
};

export const resolveTokenContext = async (
	base: TokenDocument,
	selection: TokenContextSelection,
	loader: TokenSourceLoader,
): Promise<TokenDocument> => {
	const resolver = base.resolver;
	if (resolver === undefined) {
		if (!tokenDocumentHasContextualValues(base))
			throw new Error("token document has no DTCG Resolver or inline context");
		return resolveInlineTokenContext(base, selection);
	}
	const selectedSources: TokenJsonValue[] = [];
	const inlineNames = new Set<string>();
	for (const orderEntry of resolver.resolutionOrder) {
		const operation = resolverOperation(orderEntry, resolver);
		if (operation === undefined) {
			const reference = resolverReference(orderEntry);
			if (reference !== undefined && !reference.startsWith("#/")) {
				selectedSources.push(orderEntry);
				continue;
			}
			throw new Error(`unknown resolver resolution order entry '${JSON.stringify(orderEntry)}'`);
		}
		if (operation.name !== "" && isRecord(orderEntry) && !Object.hasOwn(orderEntry, "$ref")) {
			if (inlineNames.has(operation.name))
				throw new Error(`duplicate inline resolver order name '${operation.name}'`);
			inlineNames.add(operation.name);
		}
		if (operation.kind === "set") {
			selectedSources.push(...(operation.sources ?? []));
			continue;
		}
		const contexts = operation.contexts ?? {};
		const selected = selection.contexts[operation.name] ?? operation.default;
		if (selected === undefined)
			throw new Error(`resolver context required for modifier '${operation.name}'`);
		const sources = contexts[selected];
		if (sources === undefined)
			throw new Error(`unknown resolver context '${selected}' for modifier '${operation.name}'`);
		selectedSources.push(...sources);
	}
	let root = base.root;
	for (const source of selectedSources) {
		const overlays = await readResolverSource(source, resolver, loader);
		for (const overlay of overlays) root = mergeGroups(root, overlay.root);
	}
	const selected = resolveGroupInlineContexts(root, selection, []);
	return createTokenDocument({
		format: base.format,
		formatVersion: base.formatVersion,
		root: selected,
		resolver,
		sourceLosses: base.sourceLosses,
		sourceText: `${base.sourceFingerprint}:${JSON.stringify(selection.contexts)}`,
	});
};
