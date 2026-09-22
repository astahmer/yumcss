import { randomBytes } from "node:crypto";
import { serve } from "@hono/node-server";
import type { MigrationPreviewSession } from "./contracts.ts";
import { createMigrationPreviewApp } from "./app.ts";
import type { MigrationPreviewUiPort } from "./ui-provider.ts";
import { createNodeMigrationPreviewUiProvider } from "./ui-node.ts";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 0;

export interface MigrationPreviewServerOptions {
	readonly session: MigrationPreviewSession;
	readonly host?: string;
	readonly port?: number;
	readonly token?: string;
	readonly ui?: MigrationPreviewUiPort;
}

export interface MigrationPreviewServerAddress {
	readonly host: string;
	readonly port: number;
	readonly token: string;
	readonly url: string;
}

export interface MigrationPreviewServer {
	readonly address: MigrationPreviewServerAddress;
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
 * Node transport for the migration-preview HTTP contract. All routing and session policy
 * live in the pure app so alternate runtimes can reuse it without Node.
 */
export async function createMigrationPreviewServer(options: MigrationPreviewServerOptions): Promise<MigrationPreviewServer> {
	const host = options.host ?? DEFAULT_HOST;
	const token = options.token ?? randomBytes(24).toString("hex");
	const ui = options.ui ?? createNodeMigrationPreviewUiProvider();
	const { app, dispose } = createMigrationPreviewApp({ session: options.session, token, ui });
	const nodeServer = serve({ fetch: app.fetch, hostname: host }, undefined);
	await listen(nodeServer, host, options.port ?? DEFAULT_PORT);
	const address = nodeServer.address();
	if (address === null || typeof address === "string") {
		await new Promise<void>((resolveClose) => nodeServer.close(() => resolveClose()));
		dispose();
		throw new Error("Migration Preview server did not expose a TCP address");
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
