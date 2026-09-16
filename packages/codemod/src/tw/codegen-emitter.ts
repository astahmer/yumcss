type Values = Set<string | true>;
type UtilityMap = Map<string, Values>;

const tsKey = (name: string): string =>
	/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);

export const utilityKey = (name: string, camelCaseProperty: (value: string) => string): string => {
	if (!name.includes("-")) return JSON.stringify(name);
	const camel = camelCaseProperty(name.startsWith("-") ? name.slice(1) : name);
	return name.startsWith("-") ? `"-${camel}"` : JSON.stringify(camel);
};

const unionType = (values: Iterable<string | true>): string =>
	Array.from(values)
		.toSorted((a, b) => String(a).localeCompare(String(b), "en"))
		.map((value) => (value === true ? "true" : JSON.stringify(value)))
		.join(" | ");

const OPACITY_STEPS = [
	"0",
	"5",
	"10",
	"15",
	"20",
	"25",
	"30",
	"35",
	"40",
	"45",
	"50",
	"55",
	"60",
	"65",
	"70",
	"75",
	"80",
	"85",
	"90",
	"95",
	"100",
];

const modifierTypes =
	(): string => `type OpacityModifier = ${OPACITY_STEPS.map((step) => JSON.stringify(step)).join(" | ")};

type WithOpacityModifiers<T extends string> = T | \`\${T}/\${OpacityModifier}\`;`;

const serializeConflicts = (conflicts: Record<string, Record<string, string[]>>): string => {
	const strings: string[] = [];
	const stringIndexes = new Map<string, number>();
	const propertyLists: number[][] = [];
	const propertyListIndexes = new Map<string, number>();
	const valueLists: number[][] = [];
	const valueListIndexes = new Map<string, number>();
	const intern = (value: string): number => {
		const existing = stringIndexes.get(value);
		if (existing !== undefined) return existing;
		const index = strings.length;
		stringIndexes.set(value, index);
		strings.push(value);
		return index;
	};
	const propertyList = (properties: readonly string[]): number => {
		const key = JSON.stringify(properties);
		const existing = propertyListIndexes.get(key);
		if (existing !== undefined) return existing;
		const index = propertyLists.length;
		propertyListIndexes.set(key, index);
		propertyLists.push(properties.map(intern));
		return index;
	};
	const valueList = (values: readonly number[]): number => {
		const key = JSON.stringify(values);
		const existing = valueListIndexes.get(key);
		if (existing !== undefined) return existing;
		const index = valueLists.length;
		valueListIndexes.set(key, index);
		valueLists.push([...values]);
		return index;
	};
	const encodeValueList = (values: readonly number[]): number[] => {
		const encoded: number[] = [];
		for (let index = 0; index < values.length;) {
			const start = values[index]!;
			let end = start;
			index++;
			while (index < values.length && values[index] === end + 1) {
				end = values[index]!;
				index++;
			}
			if (start === end) encoded.push(start);
			else encoded.push(-start - 1, end);
		}
		return encoded;
	};
	const entries = Object.entries(conflicts)
		.toSorted(([a], [b]) => a.localeCompare(b, "en"))
		.map(([utility, values]) => {
			let wildcardProperties = -1;
			const byProperties = new Map<number, number[]>();
			for (const [value, properties] of Object.entries(values).toSorted(([a], [b]) =>
				a.localeCompare(b, "en"),
			)) {
				const propertiesIndex = propertyList(properties);
				if (value === "*") {
					wildcardProperties = propertiesIndex;
					continue;
				}
				const valuesForProperties = byProperties.get(propertiesIndex);
				if (valuesForProperties === undefined) {
					byProperties.set(propertiesIndex, [intern(value)]);
				} else {
					valuesForProperties.push(intern(value));
				}
			}
			return [
				intern(utility),
				wildcardProperties,
				[...byProperties].map(([properties, exactValues]) => [properties, valueList(exactValues)]),
			];
		});
	return JSON.stringify({
		s: strings,
		p: propertyLists,
		v: valueLists.map(encodeValueList),
		c: entries,
	});
};

export interface GeneratedTwSources {
	readonly entry: string;
	readonly runtime: string;
	readonly conflicts: string;
	readonly build: string;
}

export class TailwindTypeEmitter {
	private readonly camelCaseProperty: (value: string) => string;

	constructor(camelCaseProperty: (value: string) => string) {
		this.camelCaseProperty = camelCaseProperty;
	}

	utilities(types: UtilityMap, modifierCapable: Set<string>): string {
		const aliases: string[] = [];
		const usedAliases = new Set<string>();
		const aliasByType = new Map<string, string>();
		const aliasName = (name: string): string => {
			const pascal = name
				.replace(/^-/, "")
				.split("-")
				.filter(Boolean)
				.map((part) => {
					const cleaned = part.replace(/[^A-Za-z0-9_$]/g, "");
					return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
				})
				.join("");
			const base = name.startsWith("-") ? `Negative${pascal}` : pascal;
			let result = `${base}Value`;
			let counter = 2;
			while (usedAliases.has(result)) result = `${pascal}Value${counter++}`;
			usedAliases.add(result);
			return result;
		};
		const lines: string[] = [];
		for (const [name, values] of types) {
			if (!values.size) continue;
			const strings = [...values].filter((value): value is string => value !== true);
			const valueType = modifierCapable.has(name)
				? `WithOpacityModifiers<${unionType(strings)} | (string & {})>`
				: `${unionType(strings)} | (string & {})`;
			let alias = aliasByType.get(valueType);
			if (alias === undefined) {
				alias = aliasName(name);
				aliasByType.set(valueType, alias);
				aliases.push(`type ${alias} = ${valueType};`);
			}
			lines.push(
				`\t${utilityKey(name, this.camelCaseProperty)}?: ${alias} | true | Array<${alias} | true>;`,
			);
		}
		return `${modifierTypes()}

${aliases.join("\n")}

interface WindUtilities {
${lines.toSorted((a, b) => a.localeCompare(b, "en", { ignorePunctuation: true })).join("\n")}
}`;
	}

	variants(
		variants: Array<{ name: string; join: ":" | "-" | "" }>,
		utilityKeyNames: ReadonlySet<string>,
	): string {
		const collisions = variants
			.map(({ name }) => tsKey(this.camelCaseProperty(name)))
			.filter((key) => utilityKeyNames.has(key.replace(/^"|"$/g, "")));
		const lines = variants.map(({ name }) => {
			const key = tsKey(this.camelCaseProperty(name));
			const property = key.replace(/^"|"$/g, "");
			return collisions.includes(key)
				? `\t${key}?: WindVariants | WindUtilities[${JSON.stringify(property)}];`
				: `\t${key}?: WindVariants;`;
		});
		const arbitrary =
			'\t[key: `${"" | "group-" | "peer-"}${"data" | "aria"}-[${string}]${"" | `/${string}`}`]: WindVariants;';
		const omit = collisions.length
			? `Omit<WindUtilities, ${collisions.map((key) => JSON.stringify(key.replace(/^"|"$/g, ""))).join(" | ")}>`
			: "WindUtilities";
		return `export type WindVariants = ${omit} & {\n${lines.join("\n")}\n${arbitrary}\n}`;
	}

	runtime(
		variants: Array<{ name: string; join: ":" | "-" | "" }>,
		conflicts: Record<string, Record<string, string[]>>,
		compose: string[],
		wildcardValues: Record<string, ReadonlySet<string>> = {},
		valueTokens: Record<string, Readonly<Record<string, string>>> = {},
	): GeneratedTwSources {
		const runtimeDeclarations: string[] = [];
		const buildDeclarations: string[] = [];
		const arrayReferences = new Map<string, string>();
		const tokenReferences = new Map<string, string>();
		let arrayIndex = 0;
		let tokenIndex = 0;
		const sharedArray = (values: readonly string[]): string => {
			const key = JSON.stringify(values);
			const existing = arrayReferences.get(key);
			if (existing !== undefined) return existing;
			const name = `__pandwindWildcardValues${arrayIndex++}`;
			arrayReferences.set(key, name);
			buildDeclarations.push(
				`const ${name}: string[] = [${values.map((value) => JSON.stringify(value)).join(", ")}];`,
			);
			return name;
		};
		const serializedConflicts =
			Object.keys(conflicts).length === 0 ? undefined : serializeConflicts(conflicts);
		const conflictDeclaration =
			serializedConflicts === undefined
				? ""
				: `type __pandwindPackedConflicts = {
	s: string[];
	p: number[][];
	v: number[][];
	c: Array<[number, number, Array<[number, number]>]>;
};

const __pandwindDecodeConflicts = (packed: __pandwindPackedConflicts) => {
	const entries = new Map<string, [number, Array<[number, number]>]>();
	for (const [utility, wildcard, groups] of packed.c) {
		entries.set(packed.s[utility]!, [wildcard, groups]);
	}
	const cache = new Map<string, Record<string, string[]>>();
	const properties = (index: number): string[] =>
		packed.p[index]!.map((property) => packed.s[property]!);
	const values = (encoded: readonly number[]): string[] => {
		const output: string[] = [];
		for (let index = 0; index < encoded.length; index++) {
			const marker = encoded[index]!;
			if (marker >= 0) {
				output.push(packed.s[marker]!);
				continue;
			}
			const start = -marker - 1;
			const end = encoded[++index]!;
			for (let value = start; value <= end; value++) output.push(packed.s[value]!);
		}
		return output;
	};
	return new Proxy(Object.create(null) as Record<string, Record<string, string[]>>, {
		get: (_target, property: string | symbol) => {
			if (typeof property !== "string") return undefined;
			const cached = cache.get(property);
			if (cached !== undefined) return cached;
			const entry = entries.get(property);
			if (entry === undefined) return undefined;
			const [wildcard, groups] = entry;
			const decoded: Record<string, string[]> = {};
			if (wildcard >= 0) decoded["*"] = properties(wildcard);
			for (const [propertyIndex, valueIndex] of groups) {
				const propertyValues = properties(propertyIndex);
				for (const value of values(packed.v[valueIndex]!)) decoded[value] = propertyValues;
			}
			cache.set(property, decoded);
			return decoded;
		},
		ownKeys: () => [...entries.keys()],
		getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
	});
};
export const __pandwindConflicts = __pandwindDecodeConflicts(JSON.parse(${JSON.stringify(serializedConflicts)}));`;
		const conflictImport =
			serializedConflicts === undefined
				? ""
				: 'import { __pandwindConflicts } from "./tw.conflicts.ts";';
		const sharedTokens = (values: Readonly<Record<string, string>>): string => {
			const entries = Object.entries(values).toSorted(([a], [b]) => a.localeCompare(b, "en"));
			const key = JSON.stringify(entries);
			const existing = tokenReferences.get(key);
			if (existing !== undefined) return existing;
			const name = `__pandwindValueTokens${tokenIndex++}`;
			tokenReferences.set(key, name);
			runtimeDeclarations.push(
				`const ${name} = { ${entries
					.map(([value, token]) => `${JSON.stringify(value)}: ${JSON.stringify(token)}`)
					.join(", ")} };`,
			);
			return name;
		};
		const variantEntries = variants.map(
			({ name, join }) =>
				`\t\t${tsKey(this.camelCaseProperty(name))}: { join: ${JSON.stringify(join)} },`,
		);
		const variantDeclaration = `const __pandwindVariants: TwOptions["variants"] = {
${variantEntries.join("\n")}
};`;
		const composeEntries = compose.length
			? `\tcompose: [\n${compose.map((key) => `\t\t${JSON.stringify(key)},`).join("\n")}\n\t],`
			: "";
		const runtimeConfigEntries = [
			"\tvariants: __pandwindVariants,",
			serializedConflicts !== undefined ? "\tconflicts: __pandwindConflicts," : "",
			composeEntries,
		]
			.filter(Boolean)
			.join("\n");
		const wildcardEntries = Object.entries(wildcardValues)
			.toSorted(([a], [b]) => a.localeCompare(b, "en"))
			.map(
				([utility, values]) =>
					`\t\t${JSON.stringify(utility)}: ${sharedArray([...values].toSorted())},`,
			);
		const valueTokenEntries = Object.entries(valueTokens)
			.toSorted(([a], [b]) => a.localeCompare(b, "en"))
			.map(([utility, values]) => `\t\t${JSON.stringify(utility)}: ${sharedTokens(values)},`);
		const valueTokenBlock = valueTokenEntries.length
			? "\tvalueTokens: {\n" + valueTokenEntries.join("\n") + "\n},"
			: "";
		const runtime = `// Generated by pandwind — do not edit. Regenerate with pandwind-codemod tw generate.
// Optional runtime metadata for arbitrary tw() calls. The generated tw.ts
// entry does not import this file; Vite and codemod tooling read it to fold
// calls and register finite candidates.
import type { TwOptions } from "pandwind/tw";
${conflictImport ? `\n${conflictImport}` : ""}

${runtimeDeclarations.length > 0 ? runtimeDeclarations.join("\n") : ""}

${variantDeclaration}
export const __pandwindRuntimeConfig: TwOptions = {
${runtimeConfigEntries}
${valueTokenBlock ? `${valueTokenBlock}\n` : ""}};
`;
		const conflictConfigEntries = [
			serializedConflicts !== undefined ? "\tconflicts: __pandwindConflicts," : "",
			composeEntries,
		]
			.filter(Boolean)
			.join("\n");
		const conflictsSource = `// Generated by pandwind — do not edit. Regenerate with pandwind-codemod tw generate.
// Optional conflict metadata for arbitrary runtime cx() calls. This module is
// separate from tw.runtime.ts so importing it cannot pull value-token metadata
// into the browser bundle.
import type { TwOptions } from "pandwind/tw";

${conflictDeclaration}

export const __pandwindConflictConfig: Pick<TwOptions, "conflicts" | "compose"> = {
${conflictConfigEntries}
};
`;
		const build = `// Generated by pandwind — do not edit. Regenerate with pandwind-codemod tw generate.
// Build-only candidate metadata. This file must never be imported by runtime
// bindings; Vite and codemod tooling read it alongside tw.ts.
${buildDeclarations.join("\n")}

export const __pandwindBuildMetadata = {
	wildcardValues: {
${wildcardEntries.join("\n")}
	},
};
`;
		const entry = `// Generated by pandwind — do not edit. Regenerate with pandwind-codemod tw generate.
// This small entry is the only module applications import for tw(). It carries
// only variant join syntax; static calls are folded by the Vite plugin before
// bundling, and finite calls are verified for CSS registration. The full
// conflict metadata stays out of the runtime graph unless an application
// explicitly opts into arbitrary runtime conflict merging.
import { createTw } from "pandwind/tw";
import type { WindVariants } from "./types";

export const tw = /* @__PURE__ */ createTw<WindVariants>({
	variants: {
${variantEntries.join("\n")}
	},
});
`;
		return { entry, runtime, conflicts: conflictsSource, build };
	}
}
