import type { DesignSystemArtifacts } from "./codegen-artifacts.ts";

/** Loads the source design system, including any generated theme bridge. */
export interface DesignSystemThemeLoader<TSystem> {
	load(css: string, base: string, themeBlock?: string): Promise<TSystem>;
}

/** Builds the utility, modifier, and variant catalog consumed by emitters. */
export interface UtilityCatalogBuilder<TSystem, TCatalog> {
	build(system: TSystem): TCatalog;
}

/** Computes conflict/composition metadata from the real source engine. */
export interface ConflictAnalyzer<TSystem, TCatalog, TAnalysis> {
	analyze(system: TSystem, catalog: TCatalog): TAnalysis;
}

/** Emits the generated declaration artifact. */
export interface TypeArtifactEmitter<TCatalog, TAnalysis> {
	emit(catalog: TCatalog, analysis: TAnalysis): string;
}

/** Emits the generated runtime helper artifact. */
export interface RuntimeArtifactEmitter<TCatalog, TAnalysis> {
	emit(catalog: TCatalog, analysis: TAnalysis): string;
}

/** Independent stages for Tailwind-compatible design-system code generation. */
export interface DesignSystemCodegenPorts<TSystem, TCatalog, TAnalysis> {
	readonly theme: DesignSystemThemeLoader<TSystem>;
	readonly catalog: UtilityCatalogBuilder<TSystem, TCatalog>;
	readonly conflicts: ConflictAnalyzer<TSystem, TCatalog, TAnalysis>;
	readonly types: TypeArtifactEmitter<TCatalog, TAnalysis>;
	readonly runtime: RuntimeArtifactEmitter<TCatalog, TAnalysis>;
}

export interface DesignSystemCodegenResult extends DesignSystemArtifacts {
	readonly utilityCount: number;
	readonly variantCount: number;
}
