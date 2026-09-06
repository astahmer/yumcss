import { createMcpHandler, type McpHttpHandler } from "@modelcontextprotocol/server";
import { Hono } from "hono";
import type { McpServerOptions } from "./server.ts";
import { createMcpServer } from "./server.ts";
import { createMcpProjectContext, createMcpToolService } from "./tools.ts";

export interface McpHttpAppOptions extends McpServerOptions {
	readonly path?: string;
	readonly legacy?: "stateless" | "reject";
	readonly responseMode?: "auto" | "json" | "sse";
}

export interface McpHttpApp {
	readonly app: Hono;
	readonly handler: McpHttpHandler;
	close(): Promise<void>;
}

/**
 * Hono composition root for the official MCP Streamable HTTP handler. The
 * handler factory creates a fresh protocol server for each request while the
 * app-scoped tool service preserves latest reports across the MCP exchange.
 * Stdio and HTTP still register the same tools through the official SDK.
 */
export function createMcpHttpApp(root: string, options: McpHttpAppOptions = {}): McpHttpApp {
	const path = options.path ?? "/mcp";
	const service =
		options.service ?? createMcpToolService(createMcpProjectContext(root), options.ports);
	const handler = createMcpHandler(() => createMcpServer(root, { service }), {
		legacy: options.legacy ?? "stateless",
		responseMode: options.responseMode ?? "auto",
	});
	const app = new Hono();
	app.all(path, (context) => handler.fetch(context.req.raw));
	app.all("*", (context) => context.json({ error: "MCP endpoint not found" }, 404));
	return { app, handler, close: handler.close };
}
