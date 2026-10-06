import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createMcpServer } from "./server.ts";

const servers: Array<ReturnType<typeof createMcpServer>> = [];

afterEach(async () => {
	for (const server of servers.splice(0)) await server.close();
});

async function nextMessage(output: PassThrough): Promise<Record<string, unknown>> {
	return await new Promise((resolveMessage, rejectMessage) => {
		let buffer = "";
		const onData = (chunk: Buffer) => {
			buffer += chunk.toString("utf8");
			const newline = buffer.indexOf("\n");
			if (newline === -1) return;
			output.off("data", onData);
			try {
				resolveMessage(JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>);
			} catch (error) {
				rejectMessage(error);
			}
		};
		output.on("data", onData);
	});
}

describe("official MCP transport", () => {
	it("serves the registered tools over stdio", async () => {
		const input = new PassThrough();
		const output = new PassThrough();
		const server = createMcpServer(process.cwd());
		servers.push(server);
		await server.connect(new StdioServerTransport(input, output));

		const initialized = nextMessage(output);
		input.write(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-11-25",
					capabilities: {},
					clientInfo: { name: "yumcss-test", version: "1.0.0" },
				},
			})}\n`,
		);
		expect(await initialized).toMatchObject({
			id: 1,
			result: {
				serverInfo: { name: "yumcss-analyze" },
				capabilities: { tools: {}, resources: {} },
			},
		});

		const listed = nextMessage(output);
		input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
		expect(await listed).toMatchObject({
			id: 2,
			result: {
				tools: expect.arrayContaining([
					expect.objectContaining({ name: "inspect_project" }),
					expect.objectContaining({ name: "preview_migration" }),
				]),
			},
		});

		const resources = nextMessage(output);
		input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "resources/list" })}\n`);
		expect(await resources).toMatchObject({
			id: 3,
			result: {
				resources: expect.arrayContaining([
					expect.objectContaining({ uri: "yumcss://catalog" }),
					expect.objectContaining({ uri: "yumcss://project/evidence" }),
				]),
			},
		});

		const resource = nextMessage(output);
		input.write(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: 4,
				method: "resources/read",
				params: { uri: "yumcss://catalog" },
			})}\n`,
		);
		expect(await resource).toMatchObject({
			id: 4,
			result: {
				contents: [
					{ uri: "yumcss://catalog", text: expect.stringContaining("yumcss.mcp.catalog/1") },
				],
			},
		});
	});
});
