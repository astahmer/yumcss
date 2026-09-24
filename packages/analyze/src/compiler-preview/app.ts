import { Buffer } from "node:buffer";
import { Hono } from "hono";
import type { CompilerPreviewRuntime } from "./runtime.ts";
import type { CompilerPreviewUiPort } from "./ui-provider.ts";

export interface CompilerPreviewAppOptions {
	readonly runtime: CompilerPreviewRuntime;
	readonly token: string;
	readonly ui: CompilerPreviewUiPort;
}

export interface CompilerPreviewAppHandle {
	readonly app: Hono;
	dispose(): void;
}

export const createCompilerPreviewApp = (
	options: CompilerPreviewAppOptions,
): CompilerPreviewAppHandle => {
	const app = new Hono();
	const uiAssetToken = Buffer.from(options.token).toString("base64url");
	app.use("*", async (context, next) => {
		context.header("Cache-Control", "no-store");
		context.header("Referrer-Policy", "no-referrer");
		const url = new URL(context.req.url);
		const assetToken = url.pathname.startsWith("/_ui/") ? url.pathname.split("/")[2] : null;
		const provided =
			context.req.header("x-pandwind-compiler-preview-token") ??
			(context.req.path === "/" ? url.searchParams.get("token") : null) ??
			(assetToken === uiAssetToken ? options.token : null);
		if (provided !== options.token)
			return context.json({ error: "Compiler Preview authorization required" }, 401);
		await next();
	});

	app.get("/", async (context) => context.html(await options.ui.loadIndexHtml(uiAssetToken)));
	app.get("/_ui/:token/assets/*", async (context) => {
		const assetPath = context.req.path.slice(`/_ui/${context.req.param("token")}/`.length);
		const asset = await options.ui.loadAsset(assetPath);
		if (asset === null) return context.notFound();
		return context.body(asset.content, 200, {
			"Content-Type": asset.contentType,
			"X-Content-Type-Options": "nosniff",
		});
	});
	app.get("/api/compiler-preview/info", (context) => context.json(options.runtime.info));
	app.get("/api/compiler-preview/files", (context) => context.json(options.runtime.files()));
	app.get("/api/compiler-preview/source", (context) => {
		const file = context.req.query("file");
		if (file === undefined || file === "")
			return context.json({ error: "A project-relative source file is required" }, 400);
		try {
			return context.json(options.runtime.read(file));
		} catch (error) {
			return context.json({ error: error instanceof Error ? error.message : String(error) }, 422);
		}
	});
	app.get("/api/compiler-preview/transform", async (context) => {
		const file = context.req.query("file");
		if (file === undefined || file === "")
			return context.json({ error: "A project-relative source file is required" }, 400);
		try {
			return context.json(await options.runtime.transform(file));
		} catch (error) {
			return context.json({ error: error instanceof Error ? error.message : String(error) }, 422);
		}
	});
	app.notFound((context) => context.json({ error: "Compiler Preview route not found" }, 404));
	app.onError((error, context) =>
		context.json({ error: error instanceof Error ? error.message : String(error) }, 500),
	);
	return { app, dispose() {} };
};
