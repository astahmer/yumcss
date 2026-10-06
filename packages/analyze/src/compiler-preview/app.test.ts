import { Buffer } from "node:buffer";
import { describe, expect, test } from "vitest";
import type { CompilerPreviewRuntime } from "./runtime.ts";
import type { CompilerPreviewUiAsset } from "./ui-provider.ts";
import { createInMemoryCompilerPreviewUiProvider } from "./ui-provider.ts";
import { createCompilerPreviewApp } from "./app.ts";

const token = "compiler-preview-test-token";

const createRuntime = (): CompilerPreviewRuntime => ({
	info: {
		root: "/project",
		viteVersion: "8.2.2",
		plugins: ["yumcss:css"],
		yumcssPlugins: ["yumcss:css"],
	},
	files: () => [{ path: "src/Card.tsx", bytes: 31 }],
	read: (file) => ({ file, source: "export const card = 'source';", sourceBytes: 31 }),
	transform: async (file) => ({
		file,
		source: "export const card = 'source';",
		code: "export const card = 'compiled';",
		sourceBytes: 31,
		outputBytes: 33,
		durationMs: 1.2,
	}),
	close: async () => undefined,
});

describe("createCompilerPreviewApp", () => {
	test("protects source and transform routes and returns Vite output", async () => {
		const uiAsset: CompilerPreviewUiAsset = {
			content: "export const preview = true;",
			contentType: "application/javascript; charset=utf-8",
		};
		const handle = createCompilerPreviewApp({
			runtime: createRuntime(),
			token,
			ui: createInMemoryCompilerPreviewUiProvider("<!doctype html><title>preview</title>", {
				"assets/index-test.js": uiAsset,
			}),
		});
		const unauthorized = await handle.app.request("/api/compiler-preview/files");
		expect(unauthorized.status).toBe(401);
		const queryToken = await handle.app.request(`/api/compiler-preview/files?token=${token}`);
		expect(queryToken.status).toBe(401);

		const headers = { "x-yumcss-compiler-preview-token": token };
		const files = await handle.app.request("/api/compiler-preview/files", { headers });
		expect(files.status).toBe(200);
		expect(await files.json()).toEqual([{ path: "src/Card.tsx", bytes: 31 }]);

		const source = await handle.app.request("/api/compiler-preview/source?file=src%2FCard.tsx", {
			headers,
		});
		expect(await source.json()).toEqual({
			file: "src/Card.tsx",
			source: "export const card = 'source';",
			sourceBytes: 31,
		});

		const transformed = await handle.app.request(
			"/api/compiler-preview/transform?file=src%2FCard.tsx",
			{ headers },
		);
		expect(await transformed.json()).toMatchObject({
			file: "src/Card.tsx",
			code: "export const card = 'compiled';",
		});

		const page = await handle.app.request("/", {
			headers: { "x-yumcss-compiler-preview-token": token },
		});
		expect(page.status).toBe(200);
		expect(page.headers.get("referrer-policy")).toBe("no-referrer");

		const assetToken = Buffer.from(token).toString("base64url");
		const unauthorizedAsset = await handle.app.request("/_ui/wrong/assets/index-test.js");
		expect(unauthorizedAsset.status).toBe(401);
		const asset = await handle.app.request(`/_ui/${assetToken}/assets/index-test.js`);
		expect(asset.status).toBe(200);
		expect(asset.headers.get("content-type")).toBe(uiAsset.contentType);
		expect(await asset.text()).toBe("export const preview = true;");
		handle.dispose();
	});

	test("returns Vite transform failures as visible diagnostics", async () => {
		const runtime = {
			...createRuntime(),
			transform: async () => {
				throw new Error("CSS transform failed");
			},
		};
		const handle = createCompilerPreviewApp({
			runtime,
			token,
			ui: createInMemoryCompilerPreviewUiProvider("<!doctype html><title>preview</title>"),
		});
		const response = await handle.app.request(
			"/api/compiler-preview/transform?file=src%2FCard.tsx",
			{
				headers: { "x-yumcss-compiler-preview-token": token },
			},
		);
		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({ error: "CSS transform failed" });
		handle.dispose();
	});
});
