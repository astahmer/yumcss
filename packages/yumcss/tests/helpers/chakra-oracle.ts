/**
 * @chakra-ui/react oracle: the real Chakra system the preset is generated
 * from, loaded from the workspace root. Chakra is a root dev dependency, so
 * the yumcss package's own dependency graph stays unchanged (the same
 * pattern as the @pandacss/shared oracle). Typed structurally against the
 * surface the generator and the parity test read, so no Chakra type enters
 * the package.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const rootRequire = createRequire(new URL("../../../../package.json", import.meta.url));

interface ChakraTokenLeaf {
	readonly value: string | number;
}

type ChakraTokenEntry = ChakraTokenLeaf | Record<string, ChakraTokenLeaf>;

interface ChakraSemanticLeaf {
	readonly value: string | Record<string, string>;
}

type ChakraSemanticRoot = ChakraSemanticLeaf | Record<string, ChakraSemanticLeaf>;

interface ChakraConfig {
	readonly conditions: Record<string, string | ReadonlyArray<string>>;
	readonly theme: {
		readonly breakpoints: Record<string, string>;
		readonly tokens: Record<string, Record<string, ChakraTokenEntry>>;
		readonly semanticTokens: Record<string, Record<string, ChakraSemanticRoot>>;
	};
	readonly utilities: {
		readonly transition: { readonly values: ReadonlyArray<string> };
		readonly transitionProperty: { readonly values: Readonly<Record<string, string>> };
	};
}

interface ChakraSystem {
	readonly css: (styles: Record<string, unknown>) => Record<string, unknown>;
	readonly token: ((path: string) => string | number | undefined) & {
		readonly var: (path: string) => string;
	};
}

export interface ChakraOracle {
	readonly config: ChakraConfig;
	readonly system: ChakraSystem;
	/** Resolve every `--chakra-*` reference a value still carries to its literal. */
	readonly inlineVariables: (value: string) => string;
}

const collapsed = (value: string): string => value.replaceAll(/\s+/gu, " ").trim();

/**
 * The scalar a Chakra token leaf declares. A token entry and a group of token
 * entries are both objects, so the entry union needs a runtime check before its
 * value can be read as the string or number the theme declares.
 */
const scalarValue = (value: unknown, chakraPath: string): string | number => {
	if (typeof value === "string" || typeof value === "number") return value;
	throw new Error("Chakra token " + chakraPath + " declares no scalar value");
};

/**
 * Chakra custom property to the literal it stands for, for every static token.
 * This is what lets the parity test compare a composed multi-property value
 * (Chakra keeps it as a variable reference) with the literal the preset ships.
 */
const literalsByVariable = (config: ChakraConfig, system: ChakraSystem): Map<string, string> => {
	const literals = new Map<string, string>();
	const register = (chakraPath: string, declared: string | number): void => {
		const variable = /^var\((--chakra-[^)]+)\)$/u.exec(system.token.var(chakraPath))?.[1];
		if (variable === undefined) return;
		const resolved = system.token(chakraPath);
		// `system.token` mis-resolves the reserved `base` path (`zIndex.base` is
		// declared as `0` yet resolves to nothing), while `system.token.var` still
		// publishes its variable. The declared theme leaf is the value Chakra's own
		// stylesheet declares, so it is the fallback rather than a guessed value.
		const literal =
			typeof resolved === "string" || typeof resolved === "number" ? resolved : declared;
		literals.set(variable, collapsed(String(literal)));
	};
	for (const [group, entries] of Object.entries(config.theme.tokens)) {
		for (const [name, entry] of Object.entries(entries)) {
			if ("value" in entry) {
				register(group + "." + name, scalarValue(entry.value, group + "." + name));
				continue;
			}
			for (const [nested, leaf] of Object.entries(entry))
				register(group + "." + name + "." + nested, leaf.value);
		}
	}
	return literals;
};

let oracle: Promise<ChakraOracle> | undefined;

export const chakraOracle = (): Promise<ChakraOracle> => {
	oracle ??= (async (): Promise<ChakraOracle> => {
		const chakra = (await import(pathToFileURL(rootRequire.resolve("@chakra-ui/react")).href)) as {
			readonly defaultConfig: ChakraConfig;
			readonly createSystem: (config: ChakraConfig, options: ChakraConfig) => ChakraSystem;
		};
		const config = chakra.defaultConfig;
		const system = chakra.createSystem(config, config);
		const literals = literalsByVariable(config, system);
		return {
			config,
			system,
			inlineVariables: (value: string): string =>
				value.replaceAll(/var\((--chakra-[^)]+)\)/gu, (_match, variable: string) => {
					const literal = literals.get(variable);
					if (literal === undefined)
						throw new Error("Chakra references " + variable + ", which the theme does not own");
					return literal;
				}),
		};
	})();
	return oracle;
};
