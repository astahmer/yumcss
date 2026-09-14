import { isGeneratedStyleSystemModule } from "../../module-specifier.ts";

const normalizePandaSourceModule = (moduleSpecifier: string): string =>
	moduleSpecifier.replace(/^#/, "");

export const isPandaGeneratedSourceModule = (
	actualSource: string,
	expectedSource?: string,
): boolean => {
	if (expectedSource !== undefined) {
		const normalizedActual = normalizePandaSourceModule(actualSource);
		const normalizedExpected = normalizePandaSourceModule(expectedSource);
		return (
			normalizedActual === normalizedExpected || normalizedActual.endsWith(`/${normalizedExpected}`)
		);
	}
	return isGeneratedStyleSystemModule(actualSource);
};
