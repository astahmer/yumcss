import { createInterface } from "node:readline";

/** Runtime identities for the MCP JSON-RPC methods handled by this server. */
export const MCP_METHOD = {
	Initialize: "initialize",
	Initialized: "notifications/initialized",
	ListTools: "tools/list",
	CallTool: "tools/call",
} as const;

export type McpMethod = (typeof MCP_METHOD)[keyof typeof MCP_METHOD];

export const MCP_PROTOCOL_VERSION = "2025-11-25" as const;
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
	MCP_PROTOCOL_VERSION,
	"2025-06-18",
	"2025-03-26",
	"2024-11-05",
] as const;
export const MCP_SERVER_INFO = {
	name: "pandwind-analyze",
	version: "0.1.0",
} as const;

export interface McpToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface McpTextContent {
	readonly type: "text";
	readonly text: string;
}

export interface McpToolResult {
	readonly content: readonly McpTextContent[];
	readonly isError?: boolean;
	readonly structuredContent?: unknown;
}

export interface McpServerHandler {
	readonly tools: readonly McpToolDefinition[];
	callTool(name: string, arguments_: unknown): Promise<McpToolResult>;
}

interface JsonRpcRequest {
	readonly jsonrpc: "2.0";
	readonly id?: string | number | null;
	readonly method: string;
	readonly params?: unknown;
}

interface JsonRpcResponse {
	readonly jsonrpc: "2.0";
	readonly id: string | number | null;
	readonly result?: unknown;
	readonly error?: {
		readonly code: number;
		readonly message: string;
		readonly data?: unknown;
	};
}

const JSON_RPC_VERSION = "2.0" as const;
const JSON_RPC_ERROR = {
	InvalidRequest: -32600,
	MethodNotFound: -32601,
	InvalidParams: -32602,
	InternalError: -32603,
} as const;

const response = (id: JsonRpcResponse["id"], result: unknown): JsonRpcResponse => ({
	jsonrpc: JSON_RPC_VERSION,
	id,
	result,
});

const errorResponse = (
	id: JsonRpcResponse["id"],
	code: number,
	message: string,
	data?: unknown,
): JsonRpcResponse => ({
	jsonrpc: JSON_RPC_VERSION,
	id,
	error: { code, message, ...(data === undefined ? {} : { data }) },
});

const textResult = (text: string, isError = false): McpToolResult => ({
	content: [{ type: "text", text }],
	...(isError ? { isError: true } : {}),
});

function isRequest(value: unknown): value is JsonRpcRequest {
	if (typeof value !== "object" || value === null) return false;
	const request = value as Partial<JsonRpcRequest>;
	return request.jsonrpc === JSON_RPC_VERSION && typeof request.method === "string";
}

function requestId(value: unknown): JsonRpcResponse["id"] {
	if (typeof value !== "object" || value === null) return null;
	const id = (value as { id?: unknown }).id;
	return typeof id === "string" || typeof id === "number" || id === null ? id : null;
}

function toolCallParams(value: unknown): { name: string; arguments: unknown } | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const params = value as { name?: unknown; arguments?: unknown };
	if (typeof params.name !== "string") return undefined;
	return { name: params.name, arguments: params.arguments ?? {} };
}

/** Dispatch one decoded JSON-RPC message without touching process globals. */
export async function dispatchMcpMessage(
	message: unknown,
	handler: McpServerHandler,
): Promise<JsonRpcResponse | undefined> {
	if (!isRequest(message))
		return errorResponse(
			requestId(message),
			JSON_RPC_ERROR.InvalidRequest,
			"invalid JSON-RPC request",
		);
	if (message.id === undefined) {
		if (message.method === MCP_METHOD.Initialized) return undefined;
		return undefined;
	}

	if (message.method === MCP_METHOD.Initialize) {
		const requestedVersion =
			typeof message.params === "object" && message.params !== null
				? (message.params as { protocolVersion?: unknown }).protocolVersion
				: undefined;
		const protocolVersion =
			typeof requestedVersion === "string" &&
			MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(
				requestedVersion as (typeof MCP_SUPPORTED_PROTOCOL_VERSIONS)[number],
			)
				? requestedVersion
				: MCP_PROTOCOL_VERSION;
		return response(message.id, {
			protocolVersion,
			capabilities: { tools: {} },
			serverInfo: MCP_SERVER_INFO,
		});
	}
	if (message.method === MCP_METHOD.ListTools)
		return response(message.id, { tools: handler.tools });
	if (message.method === MCP_METHOD.CallTool) {
		const params = toolCallParams(message.params);
		if (params === undefined)
			return errorResponse(
				message.id,
				JSON_RPC_ERROR.InvalidParams,
				"tools/call requires a tool name",
			);
		try {
			const result = await handler.callTool(params.name, params.arguments);
			return response(message.id, result);
		} catch (error) {
			return response(
				message.id,
				textResult(error instanceof Error ? error.message : String(error), true),
			);
		}
	}
	return errorResponse(
		message.id,
		JSON_RPC_ERROR.MethodNotFound,
		`method not found: ${message.method}`,
	);
}

/** Run the MCP stdio transport. stdout is reserved for JSON-RPC messages. */
export async function runMcpStdioServer(
	handler: McpServerHandler,
	options: {
		readonly input?: NodeJS.ReadableStream;
		readonly output?: NodeJS.WritableStream;
	} = {},
): Promise<void> {
	const input = options.input ?? process.stdin;
	const output = options.output ?? process.stdout;
	const lines = createInterface({ input });
	for await (const line of lines) {
		if (line.trim() === "") continue;
		let message: unknown;
		try {
			message = JSON.parse(line);
		} catch {
			const invalid = errorResponse(null, JSON_RPC_ERROR.InvalidRequest, "invalid JSON");
			output.write(`${JSON.stringify(invalid)}\n`);
			continue;
		}
		const result = await dispatchMcpMessage(message, handler);
		if (result !== undefined) output.write(`${JSON.stringify(result)}\n`);
	}
}
