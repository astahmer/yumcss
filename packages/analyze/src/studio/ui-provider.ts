/**
 * Transport for the studio client artifact. The session boundary only ever
 * ships a serialized snapshot, so the server never needs filesystem access
 * for the UI beyond this one provider.
 */
export interface StudioUiPort {
	loadIndexHtml(): Promise<string>;
}

export const createInMemoryStudioUiProvider = (html: string): StudioUiPort => ({
	loadIndexHtml: async () => html,
});
