import { randomBytes } from "node:crypto";
import { serve } from "@hono/node-server";
import type { StudioSession } from "./contracts.ts";
import { createStudioApp } from "./app.ts";
import { createInMemoryStudioUiProvider, type StudioUiPort } from "./ui-provider.ts";
import { STUDIO_HTML } from "./ui.ts";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 0;

export interface StudioServerOptions {
	readonly session: StudioSession;
	readonly host?: string;
	readonly port?: number;
	readonly token?: string;
	readonly indexHtml?: string;
	readonly ui?: StudioUiPort;
}

export interface StudioServerAddress {
	readonly host: string;
	readonly port: number;
	readonly token: string;
	readonly url: string;
}

export interface StudioServer {
	readonly address: StudioServerAddress;
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
	new Promise((resolveListen, reject) => {
		server.once("error", reject);
		server.listen(port, host, () => {
			server.off("error", reject);
			resolveListen();
		});
	});

/**
 * Node transport for the studio HTTP contract. All routing and session policy
 * live in the pure app so alternate runtimes can reuse it without Node.
 */
export async function createStudioServer(options: StudioServerOptions): Promise<StudioServer> {
	const host = options.host ?? DEFAULT_HOST;
	const token = options.token ?? randomBytes(24).toString("hex");
	const ui = options.ui ?? createInMemoryStudioUiProvider(options.indexHtml ?? STUDIO_HTML);
	const { app, dispose } = createStudioApp({ session: options.session, token, ui });
	const nodeServer = serve({ fetch: app.fetch, hostname: host }, undefined);
	await listen(nodeServer, host, options.port ?? DEFAULT_PORT);
	const address = nodeServer.address();
	if (address === null || typeof address === "string") {
		await new Promise<void>((resolveClose) => nodeServer.close(() => resolveClose()));
		dispose();
		throw new Error("studio server did not expose a TCP address");
	}

	return {
		address: {
			host,
			port: address.port,
			token,
			url: "http://" + host + ":" + address.port + "/?token=" + encodeURIComponent(token),
		},
		async close() {
			dispose();
			await options.session.close();
			await new Promise<void>((resolveClose) => nodeServer.close(() => resolveClose()));
		},
	};
}
