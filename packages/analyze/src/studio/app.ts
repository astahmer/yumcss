import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { StudioSession, StudioSnapshot } from "./contracts.ts";
import type {
	StudioEditRequest,
	StudioOpenRequest,
	StudioSelection,
	StudioTargetSelection,
	StudioThemeSelection,
} from "./contracts.ts";
import type { StudioUiPort } from "./ui-provider.ts";

const DEFAULT_MAX_BODY_BYTES = 1_000_000;

export interface StudioAppOptions {
	readonly session: StudioSession;
	readonly token: string;
	readonly ui: StudioUiPort;
	readonly maxBodyBytes?: number;
}

export interface StudioAppHandle {
	readonly app: Hono;
	dispose(): void;
}

const bodyObject = (value: unknown): Record<string, unknown> => {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error("studio request body must be an object");
	return value as Record<string, unknown>;
};

const stringField = (body: Record<string, unknown>, name: string): string => {
	const value = body[name];
	if (typeof value !== "string" || value === "")
		throw new Error("studio field '" + name + "' is required");
	return value;
};

const openRequest = (body: Record<string, unknown>): StudioOpenRequest => ({
	root: stringField(body, "root"),
	patterns: Array.isArray(body.patterns)
		? body.patterns.filter((pattern): pattern is string => typeof pattern === "string")
		: undefined,
});

const editRequest = (body: Record<string, unknown>): StudioEditRequest => ({
	file: stringField(body, "file"),
	source: stringField(body, "source"),
});

const selectionRequest = (body: Record<string, unknown>): StudioSelection => ({
	file: stringField(body, "file"),
	start: typeof body.start === "number" ? body.start : undefined,
	end: typeof body.end === "number" ? body.end : undefined,
});

const targetRequest = (body: Record<string, unknown>): StudioTargetSelection => ({
	source: typeof body.source === "string" ? body.source : undefined,
	target: stringField(body, "target"),
});

const themeRequest = (body: Record<string, unknown>): StudioThemeSelection => ({
	scope: body.scope === null ? null : stringField(body, "scope"),
});

/**
 * Pure HTTP contract for the studio session. It deliberately exposes only
 * serialized session operations; project filesystem and module-loader ports
 * stay on the server side of this boundary.
 */
export const createStudioApp = (options: StudioAppOptions): StudioAppHandle => {
	const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
	const app = new Hono();
	let current: StudioSnapshot | null = null;
	const subscribers = new Set<(data: string) => Promise<void>>();
	const unsubscribe = options.session.subscribe((snapshot) => {
		current = snapshot;
		for (const write of subscribers) void write(JSON.stringify(snapshot)).catch(() => undefined);
	});

	app.use("*", async (context, next) => {
		const provided =
			context.req.header("x-pandwind-studio-token") ??
			new URL(context.req.url).searchParams.get("token");
		if (provided !== options.token)
			return context.json({ error: "studio authorization required" }, 401);
		await next();
	});

	const readJsonBody = async (context: { req: { text(): Promise<string> } }): Promise<unknown> => {
		const source = await context.req.text();
		if (Buffer.byteLength(source, "utf8") > maxBodyBytes)
			throw new Error("request body exceeds the studio limit");
		if (source.trim() === "") return {};
		return JSON.parse(source) as unknown;
	};

	app.get("/", async (context) => context.html(await options.ui.loadIndexHtml()));
	app.get("/studio", async (context) => context.html(await options.ui.loadIndexHtml()));

	app.get("/api/studio/snapshot", (context) => {
		if (current === null) return context.json({ error: "studio session is not open" }, 409);
		return context.json(current);
	});

	app.get("/api/studio/events", (context) =>
		streamSSE(context, async (stream) => {
			const write = async (data: string) => {
				await stream.writeSSE({ data });
			};
			subscribers.add(write);
			stream.onAbort(() => {
				subscribers.delete(write);
			});
			if (current !== null) await stream.writeSSE({ data: JSON.stringify(current) });
			await new Promise<void>(() => undefined);
		}),
	);

	const postSnapshot = (
		path: string,
		operate: (body: Record<string, unknown>) => Promise<StudioSnapshot>,
	) => {
		app.post(path, async (context) => {
			const snapshot = await operate(bodyObject(await readJsonBody(context)));
			current = snapshot;
			return context.json(snapshot);
		});
	};

	postSnapshot("/api/studio/open", (body) => options.session.open(openRequest(body)));
	postSnapshot("/api/studio/edit", (body) => options.session.edit(editRequest(body)));
	postSnapshot("/api/studio/select", (body) => options.session.select(selectionRequest(body)));
	postSnapshot("/api/studio/target", (body) => options.session.switchTarget(targetRequest(body)));
	postSnapshot("/api/studio/theme", (body) => options.session.switchTheme(themeRequest(body)));

	app.notFound((context) => context.json({ error: "studio route not found" }, 404));
	app.onError((error, context) =>
		context.json({ error: error instanceof Error ? error.message : String(error) }, 400),
	);

	return {
		app,
		dispose() {
			unsubscribe();
			subscribers.clear();
		},
	};
};
