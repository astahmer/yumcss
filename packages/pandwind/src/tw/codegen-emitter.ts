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
	): string {
		const variantEntries = variants.map(
			({ name, join }) =>
				`\t\t${tsKey(this.camelCaseProperty(name))}: { join: ${JSON.stringify(join)} },`,
		);
		const conflictEntries = Object.entries(conflicts)
			.toSorted(([a], [b]) => a.localeCompare(b, "en"))
			.map(
				([utility, values]) =>
					`\t\t${JSON.stringify(utility)}: { ${Object.entries(values)
						.map(
							([value, props]) =>
								`${JSON.stringify(value)}: [${props.map((prop) => JSON.stringify(prop)).join(", ")}]`,
						)
						.join(", ")} },`,
			);
		const composeEntries = compose.length
			? `\tcompose: [\n${compose.map((key) => `\t\t${JSON.stringify(key)},`).join("\n")}\n\t],`
			: "";
		const wildcardEntries = Object.entries(wildcardValues)
			.toSorted(([a], [b]) => a.localeCompare(b, "en"))
			.map(
				([utility, values]) =>
					`\t\t${JSON.stringify(utility)}: [${[...values].toSorted().map((value) => JSON.stringify(value)).join(", ")}],`,
			);
		const wildcardBlock = wildcardEntries.length
			? `\twildcardValues: {\n${wildcardEntries.join("\n")}\n},`
			: "";
		return `import { createTw, type TwOptions } from "pandwind/tw";
	import type { WindVariants } from "./types";

	// Metadata export so apps can build a runtime cx() against the SAME
	// generated conflict map the vite plugins use (see createCx in pandwind/cx).
	export const __pandwindConfig: TwOptions = {
\tvariants: {
${variantEntries.join("\n")}
\t},
 ${conflictEntries.length ? `\tconflicts: {\n${conflictEntries.join("\n")}\n\t},` : ""}
 ${composeEntries}
${wildcardBlock}
 	};

	// The PURE annotation lets bundlers drop the whole module when every tw()
	// call in the app was statically inlined by the vite plugin.
	export const tw = /* @__PURE__ */ createTw<WindVariants>(__pandwindConfig);
`.replace(
			/^\t(?=(?:import type|\/\/ Metadata|\/\/ generated|\/\/ call|export const|};|\/\/ The PURE))/gm,
			"",
		);
	}
}
