// A type reference, not an import: the browser-side inspect action loads this module, where a bare
// package import would not resolve. The augmentation below only needs the types.
/// <reference types="@vitejs/devtools-kit" />
import type { DevtoolsClassRule, DevtoolsEvidenceSnapshot } from "./evidence/store.ts";

export const DEVTOOLS_RPC = {
	GetSnapshot: "yumcss-devtools:get-snapshot",
	GetCatalog: "yumcss-devtools:get-catalog",
	PreviewMigration: "yumcss-devtools:preview-migration",
	InspectElement: "yumcss-devtools:inspect-element",
} as const;

export interface DevtoolsMigrationInput {
	readonly files: readonly string[];
	readonly from: string;
	readonly to: string;
	readonly mode?: "safe" | "partial";
}

export interface DevtoolsElementInput {
	readonly tagName?: string;
	readonly className?: string;
	readonly classNames?: readonly string[];
	readonly attributes?: Readonly<Record<string, string>>;
	readonly computedStyles?: Readonly<Record<string, string>>;
	readonly classRules?: readonly DevtoolsClassRule[];
}

export interface DevtoolsCatalogEntry {
	readonly id: string;
	readonly officialApi?: string;
}

export interface DevtoolsMigrationPreview {
	readonly schema: string;
	readonly root: string;
	readonly from: string;
	readonly to: string;
	readonly mode: "safe" | "partial";
	readonly files: readonly {
		readonly file: string;
		readonly changed: boolean;
		readonly code: string;
		readonly diff: string;
		readonly converted: number;
		readonly skipped: number;
		readonly residuals: readonly unknown[];
		readonly loweringPlans: readonly {
			readonly program: import("@yumcss/codemod/swap/semantic-ir").StyleProgram;
			readonly representation: string;
		}[];
		readonly generatedFiles: readonly { readonly path: string; readonly content: string }[];
	}[];
}

declare module "@vitejs/devtools-kit" {
	interface DevToolsRpcServerFunctions {
		[DEVTOOLS_RPC.GetSnapshot]: () => Promise<DevtoolsEvidenceSnapshot>;
		[DEVTOOLS_RPC.GetCatalog]: () => Promise<readonly DevtoolsCatalogEntry[]>;
		[DEVTOOLS_RPC.PreviewMigration]: (
			input: DevtoolsMigrationInput,
		) => Promise<DevtoolsMigrationPreview>;
		[DEVTOOLS_RPC.InspectElement]: (
			input: DevtoolsElementInput,
		) => Promise<DevtoolsEvidenceSnapshot>;
	}
}
