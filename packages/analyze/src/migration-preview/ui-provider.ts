/**
 * Transport for the migration-preview client artifact. The session boundary only ever
 * ships a serialized snapshot, so the server never needs filesystem access
 * for the UI beyond this one provider.
 */
export interface MigrationPreviewUiPort {
	loadIndexHtml(): Promise<string>;
}

export const createInMemoryMigrationPreviewUiProvider = (html: string): MigrationPreviewUiPort => ({
	loadIndexHtml: async () => html,
});
