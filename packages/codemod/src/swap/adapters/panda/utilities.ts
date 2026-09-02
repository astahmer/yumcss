/**
 * Effective Panda utility vocabulary.
 *
 * The official Panda config loader returns the merged utility definitions from
 * presets and plugins. This value is the only source of truth used by the
 * migration parser; an unavailable config deliberately produces an empty
 * catalog instead of guessing Panda's built-ins.
 */
export class PandaUtilityCatalog {
	private constructor(
		readonly propertyAliases: ReadonlyMap<string, string>,
		readonly utilityNames: ReadonlySet<string>,
	) {}

	static empty(): PandaUtilityCatalog {
		return new PandaUtilityCatalog(new Map(), new Set());
	}

	static fromConfig(raw: unknown): PandaUtilityCatalog {
		if (!isRecord(raw)) return PandaUtilityCatalog.empty();
		const utilities = isRecord(raw.extend) ? { ...raw, ...raw.extend } : raw;
		const aliases = new Map<string, string>();
		const names = new Set<string>();
		for (const [name, definition] of Object.entries(utilities)) {
			if (name === "extend") continue;
			names.add(name);
			if (!isRecord(definition)) continue;
			const property = typeof definition.property === "string" ? definition.property : undefined;
			if (property === undefined) continue;
			const shorthand = definition.shorthand;
			if (typeof shorthand === "string") {
				aliases.set(shorthand, property);
				names.add(shorthand);
			} else if (Array.isArray(shorthand)) {
				for (const value of shorthand) {
					if (typeof value !== "string") continue;
					aliases.set(value, property);
					names.add(value);
				}
			}
			if (typeof definition.className === "string") names.add(definition.className);
		}
		return new PandaUtilityCatalog(aliases, names);
	}

	resolveProperty(name: string): string | undefined {
		return this.propertyAliases.get(name);
	}

	has(name: string): boolean {
		return this.utilityNames.has(name);
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
