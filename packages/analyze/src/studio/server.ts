import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import type {
	StudioEditRequest,
	StudioOpenRequest,
	StudioSelection,
	StudioSession,
	StudioSnapshot,
	StudioTargetSelection,
	StudioThemeSelection,
} from "./contracts.ts";
import { STUDIO_HTML } from "./ui.ts";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 0;
const MAX_BODY_BYTES = 1_000_000;

export interface StudioServerOptions {
	readonly session: StudioSession;
	readonly host?: string;
	readonly port?: number;
	readonly token?: string;
	readonly indexHtml?: string;
}

export interface StudioServerAddress {
	readonly host: string;
	readonly port: number;
	readonly token: string;
	readonly url: string;
}

export interface StudioServer {
	readonly address: StudioServerAddress;
	close(): Promise<void>;
}

const json = (response: ServerResponse, status: number, value: unknown): void => {
	response.statusCode = status;
	response.setHeader("content-type", "application/json; charset=utf-8");
	response.end(JSON.stringify(value));
};

const readBody = async (request: IncomingMessage): Promise<unknown> => {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.byteLength;
		if (size > MAX_BODY_BYTES) throw new Error("request body exceeds the studio limit");
		chunks.push(buffer);
	}
	const source = Buffer.concat(chunks).toString("utf8");
	if (source.trim() === "") return {};
	return JSON.parse(source) as unknown;
};

const bodyObject = (value: unknown): Record<string, unknown> => {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error("studio request body must be an object");
	return value as Record<string, unknown>;
};

const stringField = (body: Record<string, unknown>, name: string): string => {
	const value = body[name];
	if (typeof value !== "string" || value === "")
		throw new Error(`studio field '${name}' is required`);
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

const requestToken = (request: IncomingMessage, url: URL): string | null =>
	(request.headers["x-pandwind-studio-token"] ?? url.searchParams.get("token")) as string | null;

const authorize = (request: IncomingMessage, url: URL, token: string): boolean =>
	requestToken(request, url) === token;

/**
 * Local transport for the studio session. It deliberately exposes only
 * serialized session operations; project filesystem and module-loader ports
 * stay on the server side of this boundary.
 */
export async function createStudioServer(options: StudioServerOptions): Promise<StudioServer> {
	const host = options.host ?? DEFAULT_HOST;
	const token = options.token ?? randomBytes(24).toString("hex");
	let current: StudioSnapshot | null = null;
	const subscribers = new Set<ServerResponse>();
	const unsubscribe = options.session.subscribe((snapshot) => {
		current = snapshot;
		for (const response of subscribers) {
			response.write(`data: ${JSON.stringify(snapshot)}\n\n`);
		}
	});

	const server: Server = createServer((request, response) => {
		void (async () => {
			try {
				const url = new URL(request.url ?? "/", `http://${host}`);
				if (!authorize(request, url, token)) {
					json(response, 401, { error: "studio authorization required" });
					return;
				}
				if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/studio")) {
					response.statusCode = 200;
					response.setHeader("content-type", "text/html; charset=utf-8");
					response.end(options.indexHtml ?? STUDIO_HTML);
					return;
				}

				if (request.method === "GET" && url.pathname === "/api/studio/snapshot") {
					if (current === null) json(response, 409, { error: "studio session is not open" });
					else json(response, 200, current);
					return;
				}
				if (request.method === "GET" && url.pathname === "/api/studio/events") {
					response.statusCode = 200;
					response.setHeader("content-type", "text/event-stream; charset=utf-8");
					response.setHeader("cache-control", "no-cache");
					response.setHeader("connection", "keep-alive");
					subscribers.add(response);
					request.on("close", () => subscribers.delete(response));
					if (current !== null) response.write(`data: ${JSON.stringify(current)}\n\n`);
					return;
				}

				if (request.method !== "POST" || !url.pathname.startsWith("/api/studio/")) {
					json(response, 404, { error: "studio route not found" });
					return;
				}

				const body = bodyObject(await readBody(request));
				const snapshot =
					url.pathname === "/api/studio/open"
						? await options.session.open(openRequest(body))
						: url.pathname === "/api/studio/edit"
							? await options.session.edit(editRequest(body))
							: url.pathname === "/api/studio/select"
								? await options.session.select(selectionRequest(body))
								: url.pathname === "/api/studio/target"
									? await options.session.switchTarget(targetRequest(body))
									: url.pathname === "/api/studio/theme"
										? await options.session.switchTheme(themeRequest(body))
										: null;
				if (snapshot === null) {
					json(response, 404, { error: "studio route not found" });
					return;
				}
				current = snapshot;
				json(response, 200, snapshot);
			} catch (error) {
				json(response, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		})();
	});

	await new Promise<void>((resolveListen, reject) => {
		server.once("error", reject);
		server.listen(options.port ?? DEFAULT_PORT, host, () => {
			server.off("error", reject);
			resolveListen();
		});
	});
	const address = server.address();
	if (address === null || typeof address === "string") {
		await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
		throw new Error("studio server did not expose a TCP address");
	}

	return {
		address: {
			host,
			port: address.port,
			token,
			url: `http://${host}:${address.port}/?token=${encodeURIComponent(token)}`,
		},
		async close() {
			unsubscribe();
			for (const response of subscribers) response.end();
			subscribers.clear();
			await options.session.close();
			await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
		},
	};
}
