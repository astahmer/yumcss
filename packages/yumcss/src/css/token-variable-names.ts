import type { CssConfigReturn, TokenVariableNames } from "../types/typings.ts";
import { pairs } from "../lib/utils.ts";
import { escapeIdentifier, hashCssVar } from "./hash.ts";

const isValidAuthoredName = (name: unknown): name is string =>
	typeof name === "string" &&
	name.length > 0 &&
	!name.includes("\u0000") &&
	!/\s/.test(name) &&
	!name.startsWith("--");

/** Resolve and validate the custom-property name used for one preset token. */
export const createTokenVariableName = (
	preset: CssConfigReturn,
	debug: boolean,
	mode: TokenVariableNames = "hashed",
): ((group: string, tokenName: string) => string) => {
	const authoredNames = new Map<string, string>();
	if (mode === "authored") {
		for (const [group, names] of Object.entries(preset.tokenVariables ?? {})) {
			for (const [tokenName, authoredName] of Object.entries(names)) {
				if (!isValidAuthoredName(authoredName))
					throw new Error(
						`Invalid authored token variable name '${authoredName}' for '${group}.${tokenName}'`,
					);
				const emittedName = escapeIdentifier(authoredName);
				const previous = authoredNames.get(emittedName);
				if (previous !== undefined && previous !== `${group}.${tokenName}`)
					throw new Error(
						`Ambiguous authored token variable '--${emittedName}' maps to '${previous}' and '${group}.${tokenName}'`,
					);
				authoredNames.set(emittedName, `${group}.${tokenName}`);
			}
		}
	}

	return (group, tokenName) => {
		const authoredName =
			mode === "authored" ? preset.tokenVariables?.[group]?.[tokenName] : undefined;
		return authoredName === undefined
			? hashCssVar(pairs.join([group, tokenName]), debug)
			: escapeIdentifier(authoredName);
	};
};
