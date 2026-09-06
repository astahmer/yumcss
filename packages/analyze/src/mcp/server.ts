import { resolve } from "node:path";
import { MCP_TOOL } from "./tools.ts";
import { createMcpProjectContext, createMcpToolService } from "./tools.ts";
import { runMcpStdioServer, type McpServerHandler } from "./protocol.ts";
import { McpToolError, textToolResult } from "./tool-contract.ts";

export const MCP_COMMAND = "mcp" as const;

function parseRoot(argv: readonly string[]): string {
	let root = process.cwd();
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--root") root = argv[++index] ?? root;
		else if (argument?.startsWith("--root=")) root = argument.slice("--root=".length);
		else if (argument === "--help") return root;
		else throw new McpToolError(`mcp: unknown argument '${argument ?? ""}'`);
	}
	return resolve(process.cwd(), root);
}

export function createMcpServerHandler(root: string): McpServerHandler {
	const service = createMcpToolService(createMcpProjectContext(root));
	return {
		tools: service.tools,
		async callTool(name, arguments_) {
			try {
				return await service.call(name, arguments_);
			} catch (error) {
				return textToolResult(error instanceof Error ? error.message : String(error), true);
			}
		},
	};
}

export async function runMcpCommand(argv: readonly string[]): Promise<void> {
	const root = parseRoot(argv);
	await runMcpStdioServer(createMcpServerHandler(root));
}

export { MCP_TOOL };
