import type { McpTextContent, McpToolResult } from "./protocol.ts";

export class McpToolError extends Error {
	override readonly name = "McpToolError" as const;
}

export function textToolResult(value: unknown, isError = false): McpToolResult {
	const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
	const content: readonly McpTextContent[] = [{ type: "text", text }];
	return {
		content,
		...(isError ? { isError: true } : {}),
		...(typeof value === "string" ? {} : { structuredContent: value }),
	};
}
