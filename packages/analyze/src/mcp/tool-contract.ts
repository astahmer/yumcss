import type { CallToolResult } from "@modelcontextprotocol/server";

export class McpToolError extends Error {
	override readonly name = "McpToolError" as const;
}

export function textToolResult(value: unknown, isError = false): CallToolResult {
	const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
	const content = [{ type: "text" as const, text }];
	return {
		content,
		...(isError ? { isError: true } : {}),
		...(typeof value === "string" ? {} : { structuredContent: value }),
	};
}
