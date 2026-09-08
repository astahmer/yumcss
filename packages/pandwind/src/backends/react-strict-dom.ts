import { flattenStyle, type FlatStyles } from "../lib/utils.ts";
import type { StyleObject } from "../types/typings.ts";
import { createStyleXAdapter } from "../css/stylex-adapter.ts";
import { createCssBackend } from "./css.ts";
import { createRnBackend, type RnBackendOptions } from "./react-native.ts";
import type { StyleBackendFactory } from "./registry.ts";
import { StyleBackendId, STYLE_BACKEND_SCHEMA, type BackendCapabilityContract } from "./types.ts";
import type { ObjectBackend } from "./object.ts";

/** Platform selected by React Strict DOM's conditional package export. */
export const ReactStrictDomPlatform = {
	Web: "web",
	Native: "native",
} as const;

export type ReactStrictDomPlatform =
	(typeof ReactStrictDomPlatform)[keyof typeof ReactStrictDomPlatform];

/** Compiled style object consumed by RSD's web `style` prop via `styleq`. */
export type ReactStrictDomCompiledStyle = Readonly<{
	readonly $$css: true;
	readonly [property: string]: string | true;
}>;

/** Plain style object returned by the native RSD export. */
export type ReactStrictDomNativeStyle = Readonly<Record<string, unknown>>;

/** RSD's platform-dependent style artifact. */
export type ReactStrictDomStyle = ReactStrictDomCompiledStyle | ReactStrictDomNativeStyle;

/** Resolve the public style result to the selected platform at compile time. */
export type ReactStrictDomStyleFor<TPlatform extends ReactStrictDomPlatform> =
	TPlatform extends typeof ReactStrictDomPlatform.Native
		? ReactStrictDomNativeStyle
		: ReactStrictDomCompiledStyle;

interface ReactStrictDomBackendBaseOptions {
	readonly name?: string;
}

export interface ReactStrictDomWebBackendOptions extends ReactStrictDomBackendBaseOptions {
	readonly platform?: typeof ReactStrictDomPlatform.Web;
	readonly conditions?: Record<string, string | string[]>;
	readonly classNamePrefix?: string;
	readonly debug?: boolean;
	readonly enableDebugClassNames?: boolean;
}

export interface ReactStrictDomNativeBackendOptions
	extends Omit<RnBackendOptions, "name">, ReactStrictDomBackendBaseOptions {
	readonly platform: typeof ReactStrictDomPlatform.Native;
}

export type ReactStrictDomBackendOptions =
	| ReactStrictDomWebBackendOptions
	| ReactStrictDomNativeBackendOptions;

const REACT_STRICT_DOM_CAPABILITIES: BackendCapabilityContract = {
	schema: "pandwind.style-backend-capabilities/1",
	artifact: "style-object",
	unsupported: "throw",
	features: {
		declarations: "exact",
		conditions: "partial",
		"dynamic-values": "partial",
		"runtime-conditions": "partial",
		"unit-conversion": "partial",
		serialization: "partial",
		"stable-identity": "exact",
		ssr: "partial",
	},
};

const markCompiled = (style: Record<string, string>): ReactStrictDomCompiledStyle => {
	Object.defineProperty(style, "$$css", { value: true, enumerable: false });
	return style as ReactStrictDomCompiledStyle;
};

const webBackend = (options: ReactStrictDomWebBackendOptions) => {
	const css = createCssBackend({
		conditions: options.conditions,
		className: createStyleXAdapter({
			classNamePrefix: options.classNamePrefix,
			debug: options.debug,
			enableDebugClassNames: options.enableDebugClassNames,
			conditions: options.conditions,
		}),
	});
	const compile = (flat: FlatStyles): ReactStrictDomCompiledStyle => {
		const output: Record<string, string> = {};
		for (const [key, value] of Object.entries(flat)) output[key] = css.declare(key, value);
		return markCompiled(output);
	};
	const resolve = (style: StyleObject): ReactStrictDomCompiledStyle => compile(flattenStyle(style));
	const merge = (...styles: Array<ReactStrictDomStyle>): ReactStrictDomCompiledStyle => {
		const output: Record<string, string> = {};
		for (const style of styles) {
			for (const [key, value] of Object.entries(style)) {
				if (key !== "$$css" && typeof value === "string") output[key] = value;
			}
		}
		return markCompiled(output);
	};
	return {
		name: options.name ?? StyleBackendId.ReactStrictDom,
		capabilities: REACT_STRICT_DOM_CAPABILITIES,
		declare: (key: string, value: string) => compile({ [key]: value }),
		resolve,
		merge,
	};
};

const nativeBackend = (options: ReactStrictDomNativeBackendOptions): ObjectBackend =>
	createRnBackend({
		...options,
		name: options.name ?? StyleBackendId.ReactStrictDom,
	});

export type ReactStrictDomBackend = ReturnType<typeof webBackend> | ObjectBackend;

export function createReactStrictDomBackend(
	options: ReactStrictDomBackendOptions = {},
): ReactStrictDomBackend {
	return options.platform === ReactStrictDomPlatform.Native
		? nativeBackend(options)
		: webBackend(options);
}

export const REACT_STRICT_DOM_BACKEND: StyleBackendFactory<
	ReactStrictDomBackendOptions,
	ReactStrictDomStyle
> = {
	schema: STYLE_BACKEND_SCHEMA,
	id: StyleBackendId.ReactStrictDom,
	capabilities: REACT_STRICT_DOM_CAPABILITIES,
	create: createReactStrictDomBackend,
};
