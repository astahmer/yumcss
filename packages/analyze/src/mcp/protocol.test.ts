import { describe, expect, it } from "vitest";
import {
	dispatchMcpMessage,
	MCP_METHOD,
	runMcpStdioServer,
	type McpServerHandler,
} from "./protocol.ts";
import { PassThrough } from "node:stream";

const handler: McpServerHandler = {
	tools: [
		{
			name: "echo",
			description: "echoes its input",
			inputSchema: { type: "object" },
		},
	],
	async callTool(name, arguments_) {
		if (name !== "echo") throw new Error(`unknown tool ${name}`);
		return {
			content: [{ type: "text", text: JSON.stringify(arguments_) }],
			structuredContent: arguments_,
		};
	},
};

describe("MCP protocol boundary", () => {
	it("advertises the server and tools through initialize/list", async () => {
		const initialized = await dispatchMcpMessage(
			{ jsonrpc: "2.0", id: 1, method: MCP_METHOD.Initialize },
			handler,
		);
		const listed = await dispatchMcpMessage(
			{ jsonrpc: "2.0", id: 2, method: MCP_METHOD.ListTools },
			handler,
		);
		expect(initialized).toMatchObject({ result: { capabilities: { tools: {} } } });
		expect(listed).toMatchObject({ result: { tools: [{ name: "echo" }] } });
	});

	it("returns tool failures as MCP tool errors", async () => {
		const result = await dispatchMcpMessage(
			{ jsonrpc: "2.0", id: 3, method: MCP_METHOD.CallTool, params: { name: "missing" } },
			handler,
		);
		expect(result).toMatchObject({ result: { isError: true } });
	});

	it("keeps stdout line-delimited and ignores notifications", async () => {
		const input = new PassThrough();
		const output = new PassThrough();
		const chunks: Array<Buffer> = [];
		output.on("data", (chunk: Buffer) => chunks.push(chunk));
		const running = runMcpStdioServer(handler, { input, output });
		input.write(`${JSON.stringify({ jsonrpc: "2.0", method: MCP_METHOD.Initialized })}\n`);
		input.write(
			`${JSON.stringify({ jsonrpc: "2.0", id: 4, method: MCP_METHOD.CallTool, params: { name: "echo", arguments: { ok: true } } })}\n`,
		);
		input.end();
		await running;
		expect(JSON.parse(Buffer.concat(chunks).toString())).toMatchObject({
			id: 4,
			result: { structuredContent: { ok: true } },
		});
	});
});
