import type { CallToolResult } from "@modelcontextprotocol/server";

export interface McpToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: Readonly<Record<string, unknown>>;
}

export type McpToolResult = CallToolResult;
