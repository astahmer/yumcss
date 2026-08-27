import {
	buildComponentScopes,
	buildThemeBlock,
	buildThemeScopes,
	createConditionResolver,
	splitTokens,
	type ComponentScopeMap,
	type ResolvedConditionParts,
	type ThemeConditions,
	type ThemeScopeMap,
	type ThemeTokenGroups,
} from "./generate-theme.ts";

export interface ThemeBridge {
	buildBlock(
		groups: ThemeTokenGroups,
		resolveCondition?: (name: string) => ResolvedConditionParts | null,
	): string;
	buildScopes(themes: ThemeScopeMap | undefined): string;
	buildComponents(
		components: ComponentScopeMap | undefined,
		existingVars: ReadonlySet<string>,
		conditions: ThemeConditions | undefined,
		warn?: (message: string) => void,
	): string;
	split(groups: ThemeTokenGroups, conditions?: ThemeConditions): ReturnType<typeof splitTokens>;
}

export class DefaultThemeBridge implements ThemeBridge {
	buildBlock(
		groups: ThemeTokenGroups,
		resolveCondition?: (name: string) => ResolvedConditionParts | null,
	): string {
		return buildThemeBlock(groups, resolveCondition);
	}

	buildScopes(themes: ThemeScopeMap | undefined): string {
		return buildThemeScopes(themes);
	}

	buildComponents(
		components: ComponentScopeMap | undefined,
		existingVars: ReadonlySet<string>,
		conditions: ThemeConditions | undefined,
		warn: (message: string) => void = () => {},
	): string {
		return buildComponentScopes(
			components,
			existingVars,
			conditions === undefined ? undefined : createConditionResolver(conditions),
			warn,
		);
	}

	split(groups: ThemeTokenGroups, conditions?: ThemeConditions): ReturnType<typeof splitTokens> {
		return splitTokens(
			groups,
			conditions === undefined ? undefined : createConditionResolver(conditions),
		);
	}
}

export const createThemeBridge = (): ThemeBridge => new DefaultThemeBridge();
