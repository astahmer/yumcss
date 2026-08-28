import type { AnyTokens, StyleObject } from "../types/typings.ts";
import {
	createTokenLookup,
	isDesignModuleKey,
	type DesignModuleAdapter,
	type DesignModuleKey,
	type DesignModuleRegistry,
} from "./contracts.ts";
import { frameModule } from "./frame-module.ts";
import { layoutModule } from "./layout-module.ts";
import { textModule } from "./text-module.ts";

/* ---------------------------------------------------------------------------
 * Design-style resolution — designer vocabulary -> concrete CSS properties.
 *
 * Values are resolved against the preset's token groups here, so the design
 * layer is self-contained: the emitted CSS needs no per-property token
 * configuration (unlike raw `css()`, where the preset's `properties` config
 * resolves tokens). The class hash still encodes the resolved value, so the
 * vite extractor and the runtime produce byte-identical stylesheets.
 * -------------------------------------------------------------------------*/

type ModuleKey = DesignModuleKey;

const isModuleKey = isDesignModuleKey;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export type {
	DesignModuleAdapter,
	DesignModuleContext,
	DesignModuleRegistry,
	TokenLookup,
} from "./contracts.ts";

export class DefaultDesignModuleRegistry implements DesignModuleRegistry {
	private readonly adapters = new Map<ModuleKey, DesignModuleAdapter>();

	constructor(adapters: readonly DesignModuleAdapter[] = BUILTIN_DESIGN_MODULES) {
		for (const adapter of adapters) this.register(adapter);
	}

	register(adapter: DesignModuleAdapter): void {
		if (this.adapters.has(adapter.key)) throw new Error(`Duplicate design module '${adapter.key}'`);
		this.adapters.set(adapter.key, adapter);
	}

	resolve(
		key: ModuleKey,
		props: Record<string, unknown>,
		tokens: AnyTokens | undefined,
	): StyleObject {
		const adapter = this.adapters.get(key);
		if (adapter === undefined) throw new Error(`Unsupported design module '${key}'`);
		return adapter.resolve(props, { tokens, token: createTokenLookup(tokens) });
	}
}

export const createDesignModuleRegistry = (
	adapters: readonly DesignModuleAdapter[] = BUILTIN_DESIGN_MODULES,
): DesignModuleRegistry => new DefaultDesignModuleRegistry(adapters);

export class DesignStyleResolver {
	constructor(readonly registry: DesignModuleRegistry = createDesignModuleRegistry()) {}

	resolve(style: Record<string, unknown>, tokens: AnyTokens | undefined): StyleObject {
		return resolveDesignStyleWithRegistry(style, tokens, this.registry);
	}
}

export const resolveDesignStyle = (
	style: Record<string, unknown>,
	tokens: AnyTokens | undefined,
): StyleObject => new DesignStyleResolver().resolve(style, tokens);

const resolveDesignStyleWithRegistry = (
	style: Record<string, unknown>,
	tokens: AnyTokens | undefined,
	registry: DesignModuleRegistry,
): StyleObject => {
	const out: StyleObject = {};

	for (const [key, value] of Object.entries(style)) {
		if (value === undefined || value === null || value === false) continue;

		// Raw CSS: passed through verbatim, the engine resolves its tokens.
		if (key === "$raw") {
			Object.assign(out, value as StyleObject);
			continue;
		}

		// Dynamic input: the engine's transform owns this key.
		if (key === "$input") {
			out[key] = value as string;
			continue;
		}

		if (isModuleKey(key)) {
			Object.assign(out, registry.resolve(key, value as Record<string, unknown>, tokens));
			continue;
		}

		// Conditions, selectors and raw value-objects (`color: { _hover: "red" }`)
		// all recurse; plain values pass through untouched.
		out[key] = isPlainObject(value)
			? resolveDesignStyleWithRegistry(value, tokens, registry)
			: (value as string);
	}

	return out;
};

const BUILTIN_DESIGN_MODULES: readonly DesignModuleAdapter[] = [
	frameModule,
	layoutModule,
	textModule,
];
