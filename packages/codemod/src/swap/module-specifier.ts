const GENERATED_STYLE_SYSTEM_MODULE = /(?:^|[/#])styled-system\//u;

export const isGeneratedStyleSystemModule = (moduleSpecifier: string): boolean =>
	GENERATED_STYLE_SYSTEM_MODULE.test(moduleSpecifier);

export const isProjectLocalModule = (moduleSpecifier: string): boolean =>
	moduleSpecifier.startsWith(".") ||
	moduleSpecifier.startsWith("/") ||
	(moduleSpecifier.startsWith("#") && !isGeneratedStyleSystemModule(moduleSpecifier));
