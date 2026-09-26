import { readFile } from "node:fs/promises";
import { DefaultTokenFormatRegistry } from "./token-format-registry.ts";
import {
	TOKEN_FORMAT_SCHEMA,
	TokenFormatLossError,
	type TokenFormatAdapter,
	type TokenFormatExportOptions,
	type TokenFormatOutput,
} from "./token-format-contracts.ts";
import { parseTokenDocument, type TokenDocument } from "./token-document.ts";
import { dtcgTokenFormat } from "./token-formats/dtcg.ts";
import { dtcgResolverTokenFormat } from "./token-formats/dtcg-resolver.ts";
import { themeTokenFormat } from "./token-formats/theme.ts";
import { pandaTokenFormat } from "./token-formats/panda.ts";
import { presetTokenFormat } from "./token-formats/preset.ts";
import { styleDictionaryTokenFormat } from "./token-formats/style-dictionary.ts";
import { figmaTokenFormat } from "./token-formats/figma.ts";
import { rootCssTokenFormat } from "./token-formats/root-css.ts";
import { stylexTokenFormat } from "./token-formats/stylex.ts";

export {
	createTokenDocument,
	parseDtcgResolverDocument,
	parseDtcgTokenDocument,
	parseTokenDocument,
	parseTokenResolverDocument,
	resolveInlineTokenContext,
	resolveTokenContext,
	serializeDtcgTokenDocument,
	serializeTokenResolverDocument,
	tokenDocumentHasContextualValues,
	TOKEN_PRESET_CONTEXT_SOURCE,
	TOKEN_DOCUMENT_SCHEMA,
	TOKEN_RESOLVER_SCHEMA,
} from "./token-document.ts";
export type {
	TokenContextSelection,
	TokenDiagnostic,
	TokenDocument,
	TokenEntry,
	TokenGroup,
	TokenJsonValue,
	TokenNode,
	TokenResolverDocument,
	TokenSourceLoader,
	TokenValue,
} from "./token-document.ts";
export {
	TOKEN_FORMAT_IDS,
	TOKEN_FORMAT_SCHEMA,
	TokenFormatId,
	TokenFormatLossError,
} from "./token-format-contracts.ts";
export type {
	TokenFormatAdapter,
	TokenFormatFidelity,
	TokenFormatLoss,
	TokenFormatOutput,
	TokenFormatRegistry,
} from "./token-format-contracts.ts";

/** Versioned token-format registry façade with explicit lossy-export consent. */
export class TokenDocumentCodec {
	readonly registry: DefaultTokenFormatRegistry;

	constructor(
		registry = new DefaultTokenFormatRegistry([
			dtcgTokenFormat,
			dtcgResolverTokenFormat,
			themeTokenFormat,
			pandaTokenFormat,
			presetTokenFormat,
			styleDictionaryTokenFormat,
			figmaTokenFormat,
			rootCssTokenFormat,
			stylexTokenFormat,
		]),
	) {
		this.registry = registry;
	}

	fromText(format: string, text: string): TokenDocument {
		const adapter = this.require(format);
		if (!adapter.canImport || adapter.importText === undefined)
			throw new Error(`codemod tokens: --from=${format} requires a module path`);
		return parseTokenDocument(adapter.importText(text));
	}

	async fromFile(format: string, path: string): Promise<TokenDocument> {
		const adapter = this.require(format);
		if (!adapter.canImport) throw new Error(`codemod tokens: --from=${format} is export-only`);
		if (adapter.importFile !== undefined) return parseTokenDocument(await adapter.importFile(path));
		if (adapter.importText === undefined)
			throw new Error(`codemod tokens: ${format} has no importer`);
		return parseTokenDocument(adapter.importText(await readFile(path, "utf8")));
	}

	to(
		format: string,
		document: TokenDocument,
		options: TokenFormatExportOptions = {},
	): TokenFormatOutput {
		const adapter = this.require(format);
		if (!adapter.canExport) throw new Error(`codemod tokens: --to=${format} is not supported`);
		const validated = parseTokenDocument(document);
		const adapterOutput = adapter.export(validated, options);
		const losses = [...(validated.sourceLosses ?? []), ...adapterOutput.fidelity.losses];
		const output: TokenFormatOutput = {
			...adapterOutput,
			fidelity: { status: losses.length === 0 ? "lossless" : "lossy", losses },
		};
		if (output.fidelity.losses.length > 0 && options.allowLossy !== true)
			throw new TokenFormatLossError(adapter.id, output);
		return output;
	}

	private require(format: string): TokenFormatAdapter {
		const adapter = this.registry.get(format);
		if (adapter === undefined) throw new Error(`codemod tokens: unknown format '${format}'`);
		if (adapter.schema !== TOKEN_FORMAT_SCHEMA)
			throw new Error(`codemod tokens: unsupported adapter schema for '${format}'`);
		return adapter;
	}
}

export const tokenDocumentCodec = new TokenDocumentCodec();
