export interface CompilerPreviewUiPort {
	loadIndexHtml(): Promise<string>;
}

export const createInMemoryCompilerPreviewUiProvider = (html: string): CompilerPreviewUiPort => ({
	loadIndexHtml: async () => html,
});
