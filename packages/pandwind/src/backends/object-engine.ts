import { createHashFn } from "../css/hash.ts";
import { assign, flattenStyle, type FlatStyles } from "../lib/utils.ts";
import { isSafeCssValue } from "../css/value-normalization.ts";
import type { StyleObject } from "../types/typings.ts";
import {
	STYLE_BACKEND_SCHEMA,
	type BackendCapabilityContract,
	type BackendDeclarationIssue,
	type StyleBackend,
} from "./types.ts";
import type { StyleBackendFactory } from "./registry.ts";
import { StyleBackendId } from "./types.ts";

/** A target style object: camelCase props, target-native values. */
export type TargetStyle = Record<string, unknown>;

export interface ObjectBackendOptions {
	readonly name: string;
	readonly capabilities?: BackendCapabilityContract;
	readonly conditions?: Record<string, () => boolean>;
	readonly unsupportedProperties?: ReadonlySet<string>;
	readonly unsupportedPropertyLabel?: string;
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

type StyleValueSnapshot = { readonly signature: string; readonly value: unknown };

const snapshotStyleValue = (
	value: unknown,
	active: WeakSet<object>,
): StyleValueSnapshot | undefined => {
	if (value === null) return { signature: "null", value: null };
	if (typeof value === "string") return { signature: JSON.stringify(["string", value]), value };
	if (typeof value === "boolean") return { signature: JSON.stringify(["boolean", value]), value };
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return undefined;
		return { signature: JSON.stringify(["number", value]), value };
	}
	if (typeof value !== "object" || active.has(value)) return undefined;
	active.add(value);
	if (Array.isArray(value)) {
		const snapshots: unknown[] = [];
		const signatures: string[] = [];
		for (const item of value) {
			const snapshot = snapshotStyleValue(item, active);
			if (snapshot === undefined) return undefined;
			snapshots.push(snapshot.value);
			signatures.push(snapshot.signature);
		}
		active.delete(value);
		return {
			signature: JSON.stringify(["array", signatures]),
			value: Object.freeze(snapshots),
		};
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) return undefined;
	const copy: Record<string, unknown> = {};
	const signatures: Array<readonly [string, string]> = [];
	const entries = Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right));
	for (const [key, item] of entries) {
		const snapshot = snapshotStyleValue(item, active);
		if (snapshot === undefined) return undefined;
		Object.defineProperty(copy, key, {
			value: snapshot.value,
			enumerable: true,
			writable: true,
			configurable: true,
		});
		signatures.push([key, snapshot.signature]);
	}
	active.delete(value);
	return {
		signature: JSON.stringify(["object", signatures]),
		value: Object.freeze(copy),
	};
};

const splitKey = (key: string): { conditions: string[]; prop: string } => {
	const parts = key.split("__");
	return { conditions: parts.slice(0, -1), prop: parts[parts.length - 1]! };
};

export function createObjectBackend(options: ObjectBackendOptions): ObjectBackend {
	const convert = options.convert ?? ((prop: string, value: string) => ({ [prop]: value }));
	const resolvers = options.conditions ?? {};
	const registry = new Map<string, Map<string, TargetStyle>>();
	const hashFn = createHashFn(false);

	const diagnose = (key: string, value: string): BackendDeclarationIssue[] => {
		const { conditions, prop } = splitKey(key);
		const conditionIssues = conditions.flatMap((condition) => {
			const name = condition.replace(/^_/, "");
			return Object.hasOwn(resolvers, name) && typeof resolvers[name] === "function"
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
		const propertyIssues = options.unsupportedProperties?.has(prop)
			? [
					{
						property: prop,
						value,
						lossiness: "unsupported" as const,
						message: `pandwind/${options.name}: property "${prop}" has no ${options.unsupportedPropertyLabel ?? options.name} representation`,
					},
				]
			: [];
		return [...conditionIssues, ...propertyIssues];
	};

	const check = (key: string, value: string): void => {
		const issues = diagnose(key, value);
		if (issues.length > 0)
			throw new Error(`${issues[0]!.message} — remove it, or provide a resolver via conditions`);
	};

	const register = (style: TargetStyle): TargetStyle => {
		try {
			const entries: Array<readonly [string, StyleValueSnapshot]> = [];
			for (const [prop, value] of Object.entries(style)) {
				const snapshot = snapshotStyleValue(value, new WeakSet<object>());
				if (snapshot === undefined) return style;
				entries.push([prop, snapshot]);
			}
			const signature = JSON.stringify(
				entries
					.toSorted(([left], [right]) => left.localeCompare(right))
					.map(([prop, snapshot]) => [prop, snapshot.signature]),
			);
			if (signature === undefined) return style;
			const hash = hashFn(signature, String(entries.length));
			const bucket = registry.get(hash);
			const registered = bucket?.get(signature);
			if (registered !== undefined) return registered;
			const snapshot: TargetStyle = {};
			for (const [prop, value] of entries) {
				Object.defineProperty(snapshot, prop, {
					value: value.value,
					enumerable: true,
					writable: true,
					configurable: true,
				});
			}
			Object.freeze(snapshot);
			const stylesBySignature = bucket ?? new Map<string, TargetStyle>();
			stylesBySignature.set(signature, snapshot);
			if (bucket === undefined) registry.set(hash, stylesBySignature);
			return snapshot;
		} catch {
			return style;
		}
	};

	const declare = (key: string, value: string): TargetStyle => {
		check(key, value);
		return convert(splitKey(key).prop, String(value));
	};

	const resolve = (style: StyleObject): TargetStyle => {
		const flat = flattenStyle(assign(style)) as FlatStyles;
		const out: TargetStyle = {};
		for (const [key, raw] of Object.entries(flat)) {
			if (!isSafeCssValue(raw)) continue;
			const { conditions, prop } = splitKey(key);
			let applicable = true;
			for (const condition of conditions) {
				const name = condition.replace(/^_/, "");
				const applies = Object.hasOwn(resolvers, name) ? resolvers[name] : undefined;
				if (typeof applies !== "function") {
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
	id: StyleBackendId.Object,
	capabilities: OBJECT_BACKEND_CAPABILITIES,
	create: (options) => {
		if (options === undefined) throw new Error("pandwind/object: options.name is required");
		return createObjectBackend({
			...options,
			capabilities: options.capabilities ?? OBJECT_BACKEND_CAPABILITIES,
		});
	},
};
