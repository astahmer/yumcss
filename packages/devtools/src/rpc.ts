import "@vitejs/devtools-kit";
import type { DevtoolsEvidenceSnapshot } from "./evidence/store.ts";

export const DEVTOOLS_RPC = {
	GetSnapshot: "pandwind-devtools:get-snapshot",
	PreviewMigration: "pandwind-devtools:preview-migration",
	InspectElement: "pandwind-devtools:inspect-element",
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
	readonly attributes?: Readonly<Record<string, string>>;
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
			readonly program: import("pandwind-codemod/swap/semantic-ir").StyleProgram;
			readonly representation: string;
		}[];
		readonly generatedFiles: readonly { readonly path: string; readonly content: string }[];
	}[];
}

declare module "@vitejs/devtools-kit" {
	interface DevToolsRpcServerFunctions {
		[DEVTOOLS_RPC.GetSnapshot]: () => Promise<DevtoolsEvidenceSnapshot>;
		[DEVTOOLS_RPC.PreviewMigration]: (
			input: DevtoolsMigrationInput,
		) => Promise<DevtoolsMigrationPreview>;
		[DEVTOOLS_RPC.InspectElement]: (
			input: DevtoolsElementInput,
		) => Promise<DevtoolsEvidenceSnapshot>;
	}
}
