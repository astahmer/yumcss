import { describe, expect, test } from "vitest";
import type { MigrationPreviewRequest } from "./contracts.ts";
import { MigrationPreviewHostId, createBrowserMigrationPreviewHost } from "./browser-preview.ts";

const request = (targetCss: string): MigrationPreviewRequest =>
	({
		evaluation: { artifacts: { targetCss, files: [] }, diagnostics: [] },
		selection: null,
		target: null,
		theme: { scope: null },
		workspace: { revision: 0, root: "/preview", files: [] },
	});

describe("Migration Preview browser host", () => {
	test("injects evaluated CSS and returns computed-style evidence", async () => {
		let navigated = "";
		let closed = false;
		const host = createBrowserMigrationPreviewHost({
			url: "http://127.0.0.1:5173/preview",
			browser: {
				async newPage() {
					return {
						async goto(url) {
							navigated = url;
						},
						async evaluate<TOutput>() {
							return {
								computedStyles: { color: "rgb(239, 68, 68)" },
								stylesheetBytes: 43,
							} as TOutput;
						},
					};
				},
				async close() {
					closed = true;
				},
			},
		});

		expect(
			await host.start?.(request(".pandwind-migration-preview-probe { color: red; }")),
		).toEqual({
			host: MigrationPreviewHostId.Browser,
			status: "ready",
			url: "http://127.0.0.1:5173/preview",
			computedStyles: { color: "rgb(239, 68, 68)" },
			stylesheetBytes: 43,
		});
		expect(navigated).toBe("http://127.0.0.1:5173/preview");
		expect(
			await host.update?.(request(".pandwind-migration-preview-probe { color: blue; }")),
		).toMatchObject({
			status: "ready",
			computedStyles: { color: "rgb(239, 68, 68)" },
		});
		await host.stop?.();
		expect(closed).toBe(true);
	});
});
