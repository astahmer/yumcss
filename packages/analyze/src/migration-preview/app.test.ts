import { describe, expect, test } from "vitest";
import { MIGRATION_PREVIEW_SESSION_SCHEMA, MIGRATION_PREVIEW_SNAPSHOT_SCHEMA, type MigrationPreviewSession } from "./contracts.ts";
import { createMigrationPreviewApp } from "./app.ts";
import { createInMemoryMigrationPreviewUiProvider } from "./ui-provider.ts";

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
		async select() {
			const value = snapshot("/selected");
			listener?.(value);
			return value;
		},
		async edit() {
			const value = snapshot("/edited");
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

const makeApp = () =>
	createMigrationPreviewApp({
		session: session(),
		token: "app-token",
		ui: createInMemoryMigrationPreviewUiProvider("<html>Migration Preview app</html>"),
	});

describe("createMigrationPreviewApp", () => {
	test("authorizes requests through header or query token", async () => {
		const handle = makeApp();
		const { app } = handle;
		try {
			expect((await app.request("/api/migration-preview/snapshot")).status).toBe(401);
			expect(
				(
					await app.request("/api/migration-preview/snapshot", {
						headers: { "x-pandwind-migration-preview-token": "app-token" },
					})
				).status,
			).toBe(409);
			expect((await app.request("/api/migration-preview/snapshot?token=app-token")).status).toBe(409);
		} finally {
			handle.dispose();
		}
	});

	test("serves the ui provider and serializes session operations", async () => {
		const handle = makeApp();
		const { app } = handle;
		try {
			const page = await app.request("/", { headers: { "x-pandwind-migration-preview-token": "app-token" } });
			expect(page.status).toBe(200);
			expect(await page.text()).toContain("Migration Preview app");

			const opened = await app.request("/api/migration-preview/open?token=app-token", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ root: "/project" }),
			});
			expect(opened.status).toBe(200);
			expect(await opened.json()).toMatchObject({ workspace: { root: "/project" } });

			const malformed = await app.request("/api/migration-preview/open?token=app-token", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			});
			expect(malformed.status).toBe(400);
			expect(await malformed.json()).toMatchObject({ error: "Migration Preview field 'root' is required" });

			expect((await app.request("/nope?token=app-token")).status).toBe(404);
		} finally {
			handle.dispose();
		}
	});
});
