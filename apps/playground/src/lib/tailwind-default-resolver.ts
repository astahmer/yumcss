import { __unstable__loadDesignSystem } from "tailwindcss";
import defaultTailwindCss from "virtual:pandwind-tailwind-default-css";
import {
	parseTailwindCandidateCss,
	type StyleDeclaration,
	type TailwindUtilityResolver,
} from "pandwind-codemod/swap/browser";

export interface PlaygroundTailwindResolver extends TailwindUtilityResolver {
	readonly ready: Promise<void>;
}

function resolveDefaultThemeVariables(
	declarations: readonly StyleDeclaration[],
	system: Awaited<ReturnType<typeof __unstable__loadDesignSystem>>,
): readonly StyleDeclaration[] {
	return declarations.map((declaration) => {
		if (declaration.value.kind !== "literal" || typeof declaration.value.value !== "string")
			return declaration;
		const value = declaration.value.value.replace(
			/var\(\s*(--[-\w]+)\s*\)/gu,
			(match: string, name: string) => system.resolveThemeValue(name) ?? match,
		);
		return value === declaration.value.value
			? declaration
			: { ...declaration, value: { ...declaration.value, value } };
	});
}

/**
 * Resolve playground Tailwind examples through Tailwind's own default v4
 * stylesheet. Project migrations still use their discovered project graph;
 * this is only the browser lab's baseline when no project files exist.
 */
export function createPlaygroundTailwindResolver(): PlaygroundTailwindResolver {
	let system: Awaited<ReturnType<typeof __unstable__loadDesignSystem>> | undefined;
	const ready = __unstable__loadDesignSystem(defaultTailwindCss)
		.then((loaded) => {
			system = loaded;
		})
		.catch(() => undefined);

	return {
		ready,
		resolve(token) {
			if (system === undefined) return undefined;
			const declarations = parseTailwindCandidateCss(
				system.candidatesToCss([token])[0] ?? "",
				token,
			);
			return declarations === undefined
				? undefined
				: resolveDefaultThemeVariables(declarations, system);
		},
	};
}
