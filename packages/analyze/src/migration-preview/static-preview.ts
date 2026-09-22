import type { MigrationPreviewHostPort } from "./contracts.ts";

/**
 * Explicitly represents the safe first-release mode. Static analysis is not
 * a rendered host, so the session must expose that fact instead of silently
 * omitting preview state or pretending an arbitrary app can run in the UI.
 */
export const createStaticMigrationPreviewHost = (): MigrationPreviewHostPort => ({
	id: "static",
	available: false,
});
