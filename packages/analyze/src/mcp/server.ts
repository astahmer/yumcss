import cac from "cac";
import { resolve } from "node:path";
import { MCP_TOOL } from "./tools.ts";
import { createMcpProjectContext, createMcpToolService } from "./tools.ts";
import { runMcpStdioServer, type McpServerHandler } from "./protocol.ts";
import { textToolResult } from "./tool-contract.ts";

export const MCP_COMMAND = "mcp" as const;

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

export async function runMcpServer(root: string): Promise<void> {
	await runMcpStdioServer(createMcpServerHandler(root));
}

export async function runMcpCommand(argv: readonly string[]): Promise<void> {
	const cli = cac("pandwind-analyze mcp");
	cli.option("--root <dir>", "Project root", { default: "." });
	cli.help();
	cli.parse(["node", "pandwind-analyze mcp", ...argv], { run: false });
	if (cli.matchedCommand !== undefined) return;
	cli.globalCommand.checkUnknownOptions();
	cli.globalCommand.checkOptionValue();
	cli.globalCommand.checkUnusedArgs();
	const root = cli.options.root;
	await runMcpServer(resolve(process.cwd(), typeof root === "string" ? root : "."));
}

export { MCP_TOOL };
