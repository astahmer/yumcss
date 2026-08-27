import { createHashFn } from "../css/hash.ts";
import { assign, flattenStyle, type FlatStyles } from "../lib/utils.ts";
import type { StyleObject } from "../types/typings.ts";
import {
	STYLE_BACKEND_SCHEMA,
	type BackendCapabilityContract,
	type StyleBackend,
} from "./types.ts";
import type { StyleBackendFactory } from "./registry.ts";

/** A target style object: camelCase props, target-native values. */
export type TargetStyle = Record<string, unknown>;

export interface ObjectBackendOptions {
	readonly name: string;
	readonly capabilities?: BackendCapabilityContract;
	readonly conditions?: Record<string, () => boolean>;
	readonly convert?: (prop: string, value: string) => Record<string, unknown>;
}

const OBJECT_BACKEND_CAPABILITIES: BackendCapabilityContract = {
	schema: "pandwind.style-backend-capabilities/1",
	artifact: "style-object",
	unsupported: "throw",
	features: {
		declarations: "exact",
		conditions: "partial",
		"dynamic-values": "unsupported",
		"runtime-conditions": "exact",
		"unit-conversion": "partial",
		serialization: "partial",
		"stable-identity": "exact",
		ssr: "unsupported",
	},
};

export type ObjectBackend = StyleBackend<TargetStyle> & {
	resolve(style: StyleObject): TargetStyle;
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

	const diagnose = (key: string, value: string) =>
		splitKey(key).conditions.flatMap((condition) => {
			const name = condition.replace(/^_/, "");
			return name in resolvers
				? []
				: [
						{
							property: splitKey(key).prop,
							value,
							lossiness: "unsupported" as const,
							message: `pandwind/${options.name}: condition "_${name}" is not supported by this target`,
						},
					];
		});

	const check = (key: string, value: string): void => {
		const issues = diagnose(key, value);
		if (issues.length > 0)
			throw new Error(`${issues[0]!.message} — remove it, or provide a resolver via conditions`);
	};

	const register = (style: TargetStyle): TargetStyle => {
		const entries = Object.entries(style)
			.map(
				([prop, value]) => `${prop}=${typeof value === "string" ? value : JSON.stringify(value)}`,
			)
			.toSorted();
		const hash = hashFn(entries.join("\u0000"), String(entries.length));
		const registered = registry.get(hash);
		if (registered !== undefined) return registered;
		registry.set(hash, style);
		return style;
	};

	const declare = (key: string, value: string): TargetStyle => {
		check(key, value);
		return convert(splitKey(key).prop, String(value));
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
					check(key, String(raw));
					continue;
				}
				if (!applies()) applicable = false;
			}
			if (applicable) Object.assign(out, convert(prop, String(raw)));
		}
		return register(out);
	};

	const merge = (...styles: Array<TargetStyle>): TargetStyle =>
		register(assign(...styles.filter((style) => style !== undefined && style !== null)));

	return {
		name: options.name,
		capabilities: options.capabilities ?? OBJECT_BACKEND_CAPABILITIES,
		check,
		diagnose,
		declare,
		resolve,
		merge,
	};
}

export const OBJECT_BACKEND: StyleBackendFactory<ObjectBackendOptions, TargetStyle> = {
	schema: STYLE_BACKEND_SCHEMA,
	id: "object",
	capabilities: OBJECT_BACKEND_CAPABILITIES,
	create: (options) => {
		if (options === undefined) throw new Error("pandwind/object: options.name is required");
		return createObjectBackend({
			...options,
			capabilities: options.capabilities ?? OBJECT_BACKEND_CAPABILITIES,
		});
	},
};
