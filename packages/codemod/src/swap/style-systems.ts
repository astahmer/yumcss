import type { AdapterCapabilities } from "./capabilities.ts";
import type { StyleAdapter } from "./adapter-contract.ts";

/** Versioned registry contract for style systems and their dialects. */
export const STYLE_SYSTEM_SCHEMA = "pandwind.style-system/1" as const;

export const enum StyleDialectRoleTag {
	Source = "source",
	Target = "target",
	Both = "both",
}
export type StyleDialectRole = `${StyleDialectRoleTag}`;

/** A dialect is one concrete syntax/semantic adapter within a style system. */
export interface StyleDialectAdapter extends StyleAdapter {
	readonly system: string;
	readonly dialect: string;
	readonly role: StyleDialectRole;
}

export interface StyleSystemAdapter {
	readonly schema: typeof STYLE_SYSTEM_SCHEMA;
	readonly id: string;
	readonly dialects: readonly StyleDialectAdapter[];
	readonly capabilities?: AdapterCapabilities;
}

export interface StyleDialectAddress {
	readonly system: string;
	readonly dialect: string;
}

export interface StyleMigrationRoute {
	readonly source: StyleDialectAdapter;
	readonly target: StyleDialectAdapter;
}

export interface StyleSystemRegistry {
	readonly systems: readonly StyleSystemAdapter[];
	register(system: StyleSystemAdapter): StyleSystemRegistry;
	registerDialect(dialect: StyleDialectAdapter): StyleSystemRegistry;
	getSystem(id: string): StyleSystemAdapter | undefined;
	getDialect(address: StyleDialectAddress | string): StyleDialectAdapter | undefined;
	resolveRoute(
		from: StyleDialectAddress | string,
		to: StyleDialectAddress | string,
	): StyleMigrationRoute;
}

export interface StyleDialectOptions {
	readonly system: string;
	readonly dialect?: string;
	readonly role?: StyleDialectRole;
}

const dialectKey = (address: StyleDialectAddress | string): string =>
	typeof address === "string" ? address : `${address.system}/${address.dialect}`;

/** Add system metadata without changing the existing StyleAdapter contract. */
export function asStyleDialect(
	adapter: StyleAdapter,
	options: StyleDialectOptions,
): StyleDialectAdapter {
	return {
		...adapter,
		system: options.system,
		dialect: options.dialect ?? adapter.id,
		role: options.role ?? StyleDialectRoleTag.Both,
	};
}

export function createStyleSystem(
	id: string,
	dialects: readonly StyleDialectAdapter[],
	capabilities?: AdapterCapabilities,
): StyleSystemAdapter {
	if (dialects.some((dialect) => dialect.system !== id))
		throw new Error(`style system ${id} contains a dialect from another system`);
	return { schema: STYLE_SYSTEM_SCHEMA, id, dialects, capabilities };
}

export function createStyleSystemRegistry(
	initial: readonly StyleSystemAdapter[] = [],
): StyleSystemRegistry {
	const bySystem = new Map<string, StyleSystemAdapter>();
	const byDialect = new Map<string, StyleDialectAdapter>();

	const register = (system: StyleSystemAdapter): StyleSystemRegistry => {
		if (system.schema !== STYLE_SYSTEM_SCHEMA)
			throw new Error(`unsupported style system schema: ${system.schema}`);
		if (bySystem.has(system.id)) throw new Error(`style system already registered: ${system.id}`);
		for (const dialect of system.dialects) {
			const key = `${system.id}/${dialect.dialect}`;
			if (byDialect.has(key)) throw new Error(`style dialect already registered: ${key}`);
			const short = dialect.id;
			const shortOwner = byDialect.get(short);
			if (shortOwner !== undefined && shortOwner !== dialect)
				throw new Error(`style dialect id already registered: ${short}`);
			byDialect.set(key, dialect);
			// Short ids are convenient for existing CLI callers, but are rejected
			// on collision so a future system cannot silently shadow one.
			if (!byDialect.has(dialect.id)) byDialect.set(dialect.id, dialect);
		}
		bySystem.set(system.id, system);
		return registry;
	};

	const registry: StyleSystemRegistry = {
		get systems() {
			return [...bySystem.values()];
		},
		register,
		registerDialect(dialect) {
			const current = bySystem.get(dialect.system);
			if (current === undefined) {
				return register(createStyleSystem(dialect.system, [dialect]));
			}
			const next = createStyleSystem(
				current.id,
				[...current.dialects, dialect],
				current.capabilities,
			);
			bySystem.delete(current.id);
			for (const existing of current.dialects) {
				byDialect.delete(`${current.id}/${existing.dialect}`);
				if (byDialect.get(existing.id) === existing) byDialect.delete(existing.id);
			}
			return register(next);
		},
		getSystem: (id) => bySystem.get(id),
		getDialect(address) {
			return byDialect.get(dialectKey(address));
		},
		resolveRoute(from, to) {
			const source = registry.getDialect(from);
			const target = registry.getDialect(to);
			if (source === undefined)
				throw new Error(`unknown source style dialect: ${dialectKey(from)}`);
			if (target === undefined) throw new Error(`unknown target style dialect: ${dialectKey(to)}`);
			if (source.role === StyleDialectRoleTag.Target)
				throw new Error(`style dialect is not a source: ${source.id}`);
			if (target.role === StyleDialectRoleTag.Source)
				throw new Error(`style dialect is not a target: ${target.id}`);
			return { source, target };
		},
	};
	for (const system of initial) registry.register(system);
	return registry;
}
