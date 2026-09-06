import { afterEach, describe, expect, it } from "vitest";
import { createMcpHttpApp, type McpHttpApp } from "./http.ts";
import type { McpToolService } from "./tools.ts";

const apps: McpHttpApp[] = [];

afterEach(async () => {
	for (const app of apps.splice(0)) await app.close();
});

describe("Hono MCP transport", () => {
	it("serves the official MCP handler over Streamable HTTP", async () => {
		const handle = createMcpHttpApp(process.cwd(), { responseMode: "json" });
		apps.push(handle);
		const response = await handle.app.request("http://localhost/mcp", {
			method: "POST",
			headers: {
				accept: "application/json, text/event-stream",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-11-25",
					capabilities: {},
					clientInfo: { name: "pandwind-http-test", version: "1.0.0" },
				},
			}),
		});
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('"serverInfo":{"name":"pandwind-analyze"');
		expect(body).toContain('"id":1');
	});

	it("keeps the MCP endpoint explicit", async () => {
		const handle = createMcpHttpApp(process.cwd());
		apps.push(handle);
		const response = await handle.app.request("http://localhost/other");
		expect(response.status).toBe(404);
	});

	it("accepts a shared tool service from the host", async () => {
		const calls: string[] = [];
		const service: McpToolService = {
			tools: [],
			resources: [],
			async call(name) {
				calls.push(name);
				return { content: [{ type: "text", text: "ok" }] };
			},
			async readResource() {
				return "";
			},
		};
		const handle = createMcpHttpApp(process.cwd(), { service });
		apps.push(handle);
		const response = await handle.app.request("http://localhost/mcp", {
			method: "POST",
			headers: {
				accept: "application/json, text/event-stream",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name: "inspect_project", arguments: {} },
			}),
		});
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('"text":"ok"');
		expect(calls).toEqual(["inspect_project"]);
	});
});
