import { describe, expect, test } from "vitest";
import type { StudioPreviewRequest } from "./contracts.ts";
import { StudioPreviewHostId, createBrowserStudioPreviewHost } from "./browser-preview.ts";

const request = (targetCss: string): StudioPreviewRequest =>
	({
		evaluation: { artifacts: { targetCss, files: [] }, diagnostics: [] },
		selection: null,
		target: null,
		theme: { scope: null },
		workspace: {},
	}) as unknown as StudioPreviewRequest;

describe("browser Studio preview host", () => {
	test("injects evaluated CSS and returns computed-style evidence", async () => {
		let navigated = "";
		let closed = false;
		const host = createBrowserStudioPreviewHost({
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

		expect(await host.start?.(request(".pandwind-studio-probe { color: red; }"))).toEqual({
			host: StudioPreviewHostId.Browser,
			status: "ready",
			url: "http://127.0.0.1:5173/preview",
			computedStyles: { color: "rgb(239, 68, 68)" },
			stylesheetBytes: 43,
		});
		expect(navigated).toBe("http://127.0.0.1:5173/preview");
		expect(await host.update?.(request(".pandwind-studio-probe { color: blue; }"))).toMatchObject({
			status: "ready",
			computedStyles: { color: "rgb(239, 68, 68)" },
		});
		await host.stop?.();
		expect(closed).toBe(true);
	});
});
