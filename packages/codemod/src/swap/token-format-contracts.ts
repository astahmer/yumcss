import type { TokenDocument } from "./token-document.ts";

export const TOKEN_FORMAT_SCHEMA = "yumcss.token-format/1" as const;

export const TokenFormatId = {
	Dtcg: "dtcg",
	DtcgResolver: "dtcg-resolver",
	Theme: "theme",
	Panda: "panda",
	Preset: "preset",
	StyleDictionary: "sd",
	Figma: "figma",
	RootCss: "rootcss",
	StyleX: "stylex",
} as const;

export type TokenFormatId = (typeof TokenFormatId)[keyof typeof TokenFormatId];

export const TOKEN_FORMAT_IDS: readonly TokenFormatId[] = [
	TokenFormatId.Dtcg,
	TokenFormatId.DtcgResolver,
	TokenFormatId.Theme,
	TokenFormatId.Panda,
	TokenFormatId.Preset,
	TokenFormatId.StyleDictionary,
	TokenFormatId.Figma,
	TokenFormatId.RootCss,
	TokenFormatId.StyleX,
];

export interface TokenFormatFidelity {
	readonly import: "lossless" | "partial";
	readonly export: "lossless" | "partial";
	readonly preserves: readonly string[];
	readonly mayLose: readonly string[];
}

export interface TokenFormatLoss {
	readonly path: string;
	readonly feature: string;
	readonly reason: string;
}

export interface TokenFormatOutput {
	readonly text: string;
	readonly resolverText?: string;
	readonly fidelity: {
		readonly status: "lossless" | "lossy";
		readonly losses: readonly TokenFormatLoss[];
	};
}

export interface TokenFormatAdapter {
	readonly schema: typeof TOKEN_FORMAT_SCHEMA;
	readonly id: TokenFormatId;
	readonly canImport: boolean;
	readonly canExport: boolean;
	readonly fidelity: TokenFormatFidelity;
	readonly importText?: (text: string) => TokenDocument;
	readonly importFile?: (path: string) => Promise<TokenDocument>;
	readonly export: (
		document: TokenDocument,
		options?: TokenFormatExportOptions,
	) => TokenFormatOutput;
}

export interface TokenFormatRegistry {
	readonly adapters: readonly TokenFormatAdapter[];
	register(adapter: TokenFormatAdapter): TokenFormatRegistry;
	get(id: string): TokenFormatAdapter | undefined;
}

export interface TokenFormatExportOptions {
	readonly allowLossy?: boolean;
	readonly resolverSidecar?: boolean;
}

export class TokenFormatLossError extends Error {
	readonly output: TokenFormatOutput;

	constructor(format: TokenFormatId, output: TokenFormatOutput) {
		super(
			`codemod tokens: exporting to ${format} would lose ${output.fidelity.losses.length} token feature(s); pass --allow-lossy to continue`,
		);
		this.name = "TokenFormatLossError";
		this.output = output;
	}
}
