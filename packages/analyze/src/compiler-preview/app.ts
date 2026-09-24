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
	app.use("*", async (context, next) => {
		context.header("Cache-Control", "no-store");
		context.header("Referrer-Policy", "no-referrer");
		const provided =
			context.req.header("x-pandwind-compiler-preview-token") ??
			new URL(context.req.url).searchParams.get("token");
		if (provided !== options.token)
			return context.json({ error: "Compiler Preview authorization required" }, 401);
		await next();
	});

	app.get("/", async (context) => context.html(await options.ui.loadIndexHtml()));
	app.get("/api/compiler-preview/info", (context) => context.json(options.runtime.info));
	app.get("/api/compiler-preview/files", (context) => context.json(options.runtime.files()));
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
