export interface CompilerPreviewUiAsset {
	readonly content: string;
	readonly contentType: "application/javascript; charset=utf-8" | "text/css; charset=utf-8";
}

export interface CompilerPreviewUiPort {
	loadIndexHtml(assetToken: string): Promise<string>;
	loadAsset(path: string): Promise<CompilerPreviewUiAsset | null>;
}

export const createInMemoryCompilerPreviewUiProvider = (
	html: string,
	assets: Readonly<Record<string, CompilerPreviewUiAsset>> = {},
): CompilerPreviewUiPort => ({
	loadIndexHtml: async () => html,
	loadAsset: async (path) => assets[path] ?? null,
});
