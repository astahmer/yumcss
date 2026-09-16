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

export interface GeneratedTwSources {
	readonly entry: string;
	readonly runtime: string;
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
		const propReferences = new Map<string, string>();
		const arrayReferences = new Map<string, string>();
		const tokenReferences = new Map<string, string>();
		let propIndex = 0;
		let arrayIndex = 0;
		let tokenIndex = 0;
		const sharedProps = (props: readonly string[]): string => {
			const key = JSON.stringify(props);
			const existing = propReferences.get(key);
			if (existing !== undefined) return existing;
			const name = `__pandwindConflictProps${propIndex++}`;
			propReferences.set(key, name);
			runtimeDeclarations.push(
				`const ${name}: string[] = [${props.map((prop) => JSON.stringify(prop)).join(", ")}];`,
			);
			return name;
		};
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
		const conflictEntries = Object.entries(conflicts)
			.toSorted(([a], [b]) => a.localeCompare(b, "en"))
			.map(
				([utility, values]) =>
					`\t\t${JSON.stringify(utility)}: { ${Object.entries(values)
						.map(([value, props]) => `${JSON.stringify(value)}: ${sharedProps(props)}`)
						.join(", ")} },`,
			);
		const composeEntries = compose.length
			? `\tcompose: [\n${compose.map((key) => `\t\t${JSON.stringify(key)},`).join("\n")}\n\t],`
			: "";
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
// Optional conflict metadata for arbitrary runtime tw() and cx() calls. The
// generated tw.ts entry does not import this file; Vite and codemod tooling
// read it to fold calls and register finite candidates.
import type { TwOptions } from "pandwind/tw";

${runtimeDeclarations.join("\n")}

export const __pandwindRuntimeConfig: TwOptions = {
	variants: {
${variantEntries.join("\n")}
	},
${conflictEntries.length ? `\tconflicts: {\n${conflictEntries.join("\n")}\n\t},\n` : ""}${composeEntries ? `${composeEntries}\n` : ""}${valueTokenBlock ? `${valueTokenBlock}\n` : ""}};
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
		return { entry, runtime, build };
	}
}
