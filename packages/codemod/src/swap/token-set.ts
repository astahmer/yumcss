/** Token interoperability façade: one normalized set, many format adapters. */
import { DefaultTokenFormatRegistry } from "./token-format-registry.ts";
import { TokenFormatId, type TokenFormatAdapter, type TokenSet } from "./token-format-contracts.ts";
import { dtcgTokenFormat } from "./token-formats/dtcg.ts";
import { themeTokenFormat } from "./token-formats/theme.ts";
import { pandaTokenFormat } from "./token-formats/panda.ts";
import { presetTokenFormat } from "./token-formats/preset.ts";
import { styleDictionaryTokenFormat } from "./token-formats/style-dictionary.ts";
import { figmaTokenFormat } from "./token-formats/figma.ts";
import { rootCssTokenFormat } from "./token-formats/root-css.ts";
import { stylexTokenFormat } from "./token-formats/stylex.ts";

class TokenSetCodec {
	readonly registry: DefaultTokenFormatRegistry;

	constructor(
		registry = new DefaultTokenFormatRegistry([
			dtcgTokenFormat,
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

	fromText(format: string, text: string): TokenSet {
		const adapter = this.require(format);
		if (!adapter.canImport || adapter.importText === undefined)
			throw new Error(`codemod tokens: --from=${format} requires a module path`);
		return adapter.importText(text);
	}

	async fromFile(format: string, path: string): Promise<TokenSet> {
		const adapter = this.require(format);
		if (!adapter.canImport) throw new Error(`codemod tokens: --from=${format} is export-only`);
		if (adapter.importFile !== undefined) return adapter.importFile(path);
		const { readFile } = await import("node:fs/promises");
		if (adapter.importText === undefined)
			throw new Error(`codemod tokens: ${format} has no importer`);
		return adapter.importText(await readFile(path, "utf8"));
	}

	to(format: string, set: TokenSet): string {
		const adapter = this.require(format);
		if (!adapter.canExport) throw new Error(`codemod tokens: --to=${format} is not supported`);
		return adapter.export(set);
	}

	fromDtcgJson(text: string): TokenSet {
		return this.fromText(TokenFormatId.Dtcg, text);
	}
	toDtcgJson(set: TokenSet): string {
		return this.to(TokenFormatId.Dtcg, set);
	}
	fromThemeCss(text: string): TokenSet {
		return this.fromText(TokenFormatId.Theme, text);
	}
	toThemeCss(set: TokenSet): string {
		return this.to(TokenFormatId.Theme, set);
	}
	fromStyleDictionary(text: string): TokenSet {
		return this.fromText(TokenFormatId.StyleDictionary, text);
	}
	toStyleDictionary(set: TokenSet): string {
		return this.to(TokenFormatId.StyleDictionary, set);
	}
	fromFigmaTokens(text: string): TokenSet {
		return this.fromText(TokenFormatId.Figma, text);
	}
	toFigmaTokens(set: TokenSet): string {
		return this.to(TokenFormatId.Figma, set);
	}
	fromRootCss(text: string): TokenSet {
		return this.fromText(TokenFormatId.RootCss, text);
	}
	toRootCss(set: TokenSet): string {
		return this.to(TokenFormatId.RootCss, set);
	}
	toStylexVars(set: TokenSet): string {
		return this.to(TokenFormatId.StyleX, set);
	}
	fromDefinePreset(path: string): Promise<TokenSet> {
		return this.fromFile(TokenFormatId.Preset, path);
	}
	fromPandaConfig(path: string): Promise<TokenSet> {
		return this.fromFile(TokenFormatId.Panda, path);
	}

	private require(format: string): TokenFormatAdapter {
		const adapter = this.registry.get(format);
		if (adapter === undefined) throw new Error(`codemod tokens: unknown format '${format}'`);
		return adapter;
	}
}

export const tokenSetCodec = new TokenSetCodec();
