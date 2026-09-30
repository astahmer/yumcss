import { randomBytes } from "node:crypto";
import { serve } from "@hono/node-server";
import { createCompilerPreviewRuntime } from "./runtime.ts";
import type { CompilerPreviewRuntime } from "./runtime.ts";
import { createNodeCompilerPreviewUiProvider } from "./ui-node.ts";
import type { CompilerPreviewUiPort } from "./ui-provider.ts";
import { createCompilerPreviewApp } from "./app.ts";

const DEFAULT_HOST = "127.0.0.1";

export interface CompilerPreviewServerOptions {
	readonly root: string;
	readonly configFile?: string;
	readonly host?: string;
	readonly port?: number;
	readonly token?: string;
	readonly ui?: CompilerPreviewUiPort;
	readonly runtime?: CompilerPreviewRuntime;
}

interface CompilerPreviewServerAddress {
	readonly host: string;
	readonly port: number;
	readonly token: string;
	readonly url: string;
}

export interface CompilerPreviewServer {
	readonly address: CompilerPreviewServerAddress;
	close(): Promise<void>;
}

type ListenableServer = {
	once(event: "error", listener: (error: Error) => void): unknown;
	off(event: "error", listener: (error: Error) => void): unknown;
	listen(port: number, host: string, listener: () => void): unknown;
	address(): { port: number } | string | null;
	close(listener: () => void): unknown;
};

const listen = (server: ListenableServer, host: string, port: number): Promise<void> =>
	new Promise((resolveListen, rejectListen) => {
		const onError = (error: Error) => {
			server.off("error", onError);
			rejectListen(error);
		};
		server.once("error", onError);
		server.listen(port, host, () => {
			server.off("error", onError);
			resolveListen();
		});
	});

export const createCompilerPreviewServer = async (
	options: CompilerPreviewServerOptions,
): Promise<CompilerPreviewServer> => {
	const runtime = options.runtime ?? (await createCompilerPreviewRuntime(options));
	const token = options.token ?? randomBytes(32).toString("hex");
	const host = options.host ?? DEFAULT_HOST;
	const { app, dispose } = createCompilerPreviewApp({
		runtime,
		token,
		ui: options.ui ?? createNodeCompilerPreviewUiProvider(),
	});
	const nodeServer = serve({ fetch: app.fetch, hostname: host }, undefined);
	try {
		await listen(nodeServer, host, options.port ?? 0);
	} catch (error) {
		dispose();
		if (options.runtime === undefined) await runtime.close();
		throw error;
	}
	const address = nodeServer.address();
	if (address === null || typeof address === "string") {
		await new Promise<void>((resolveClose) => nodeServer.close(() => resolveClose()));
		dispose();
		if (options.runtime === undefined) await runtime.close();
		throw new Error("Compiler Preview server did not expose a TCP address");
	}

	return {
		address: {
			host,
			port: address.port,
			token,
			url: `http://${host}:${address.port}/?token=${encodeURIComponent(token)}`,
		},
		async close() {
			dispose();
			await new Promise<void>((resolveClose) => nodeServer.close(() => resolveClose()));
			if (options.runtime === undefined) await runtime.close();
		},
	};
};
