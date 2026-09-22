import { describe, expect, test } from "vitest";
import { MIGRATION_PREVIEW_SESSION_SCHEMA, MIGRATION_PREVIEW_SNAPSHOT_SCHEMA, type MigrationPreviewSession } from "./contracts.ts";
import { createMigrationPreviewServer } from "./server.ts";
import { createInMemoryMigrationPreviewUiProvider } from "./ui-provider.ts";

const ui = createInMemoryMigrationPreviewUiProvider(
	"<!doctype html><html><body><h1>pandwind / migration preview</h1></body></html>",
);

function session(): MigrationPreviewSession {
	let listener: ((snapshot: Awaited<ReturnType<MigrationPreviewSession["open"]>>) => void) | undefined;
	const snapshot = (root: string) => ({
		schema: MIGRATION_PREVIEW_SNAPSHOT_SCHEMA,
		revision: 1,
		workspace: { revision: 1, root, files: [] },
		selection: null,
		target: null,
		theme: { scope: null },
		evaluation: { diagnostics: [] },
	});
	return {
		schema: MIGRATION_PREVIEW_SESSION_SCHEMA,
		async open(request) {
			const value = snapshot(request.root);
			listener?.(value);
			return value;
		},
		async edit() {
			const value = snapshot("/edited");
			listener?.(value);
			return value;
		},
		async select() {
			const value = snapshot("/selected");
			listener?.(value);
			return value;
		},
		async switchTarget() {
			const value = snapshot("/target");
			listener?.(value);
			return value;
		},
		async switchTheme() {
			const value = snapshot("/theme");
			listener?.(value);
			return value;
		},
		subscribe(next) {
			listener = next;
			return () => {
				listener = undefined;
			};
		},
		async close() {
			listener = undefined;
		},
	};
}

describe("createMigrationPreviewServer", () => {
	test("protects the session and routes authorized operations", async () => {
		const server = await createMigrationPreviewServer({ session: session(), token: "test-token", ui });
		const origin = new URL(server.address.url).origin;
		try {
			const unauthorized = await fetch(`${origin}/api/migration-preview/snapshot`);
			expect(unauthorized.status).toBe(401);

			const opened = await fetch(`${origin}/api/migration-preview/open?token=test-token`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ root: "/project", patterns: ["src/**/*.tsx"] }),
			});
			expect(opened.status).toBe(200);
			expect(await opened.json()).toMatchInlineSnapshot(`
				{
				  "evaluation": {
				    "diagnostics": [],
				  },
				  "revision": 1,
				  "schema": "pandwind.migration-preview-snapshot/1",
				  "selection": null,
				  "target": null,
				  "theme": {
				    "scope": null,
				  },
				  "workspace": {
				    "files": [],
				    "revision": 1,
				    "root": "/project",
				  },
				}
			`);
			const page = await fetch(`${origin}/?token=test-token`);
			expect(page.status).toBe(200);
			expect(await page.text()).toContain("pandwind / migration preview");

			const malformed = await fetch(`${origin}/api/migration-preview/open?token=test-token`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			});
			expect(malformed.status).toBe(400);
			expect(await malformed.json()).toMatchObject({ error: "Migration Preview field 'root' is required" });
		} finally {
			await server.close();
		}
	});
});
