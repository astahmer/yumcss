import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const NEXT_PROOF_SCHEMA = "pandwind.next-installed-proof/1" as const;

export interface NextProofFailure {
	readonly path: string;
	readonly reason: string;
}

export interface NextHttpProof {
	readonly checked: true;
	readonly routeCount: number;
	readonly sourceFailures: readonly NextProofFailure[];
	readonly targetFailures: readonly NextProofFailure[];
	readonly routeSetEqual: boolean;
}

export interface NextRscProof {
	readonly checked: true;
	readonly routeCount: number;
	readonly sourceFailures: readonly NextProofFailure[];
	readonly targetFailures: readonly NextProofFailure[];
	readonly streamedRoutes: number;
}

export interface NextBrowserProof {
	readonly checked: true;
	readonly routeCount: number;
	readonly equivalent: boolean;
	readonly failures: readonly NextProofFailure[];
	readonly pageErrors: readonly NextProofFailure[];
	readonly consoleErrors: readonly NextProofFailure[];
	readonly ignoredConsoleErrors: readonly NextProofFailure[];
}

export interface NextInstalledProof {
	readonly schema: typeof NEXT_PROOF_SCHEMA;
	readonly http: NextHttpProof;
	readonly rsc: NextRscProof;
	readonly browser: NextBrowserProof;
}

interface NextRouteManifest {
	readonly routes: Readonly<Record<string, unknown>>;
}

interface NextResponseEvidence {
	readonly status: number;
	readonly contentType: string;
	readonly bytes: number;
	readonly chunks: number;
	readonly text: string;
}

interface NextServer {
	readonly url: string;
	readonly close: () => Promise<void>;
}

const EXPECTED_NOT_FOUND_ROUTE = "/_not-found";

function routeStatus(path: string): number {
	return path === EXPECTED_NOT_FOUND_ROUTE ? 404 : 200;
}

function readRoutes(root: string): readonly string[] {
	const manifestPath = join(root, ".next/prerender-manifest.json");
	if (!existsSync(manifestPath))
		throw new Error(`missing Next prerender manifest: ${manifestPath}`);
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as NextRouteManifest;
	return Object.keys(manifest.routes).toSorted();
}

function isRscRoute(path: string): boolean {
	return (
		path !== EXPECTED_NOT_FOUND_ROUTE &&
		path !== "/og" &&
		!path.startsWith("/llms.txt/") &&
		!path.endsWith(".txt")
	);
}

async function readResponse(response: Response): Promise<NextResponseEvidence> {
	if (response.body === null) {
		const text = await response.text();
		return {
			status: response.status,
			contentType: response.headers.get("content-type") ?? "",
			bytes: Buffer.byteLength(text),
			chunks: text.length === 0 ? 0 : 1,
			text,
		};
	}
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	while (true) {
		const next = await reader.read();
		if (next.done) break;
		if (next.value !== undefined) chunks.push(next.value);
	}
	const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
	return {
		status: response.status,
		contentType: response.headers.get("content-type") ?? "",
		bytes: body.byteLength,
		chunks: chunks.length,
		text: body.toString("utf8"),
	};
}

async function request(
	baseUrl: string,
	path: string,
	headers: Readonly<Record<string, string>> = {},
): Promise<NextResponseEvidence> {
	const response = await fetch(`${baseUrl}${path}`, { headers, redirect: "manual" });
	return readResponse(response);
}

function routeFailure(path: string, reason: string): NextProofFailure {
	return { path, reason };
}

function checkHttpResponse(
	path: string,
	response: NextResponseEvidence,
): NextProofFailure | undefined {
	const expectedStatus = routeStatus(path);
	if (response.status !== expectedStatus)
		return routeFailure(path, `expected HTTP ${expectedStatus}, got ${response.status}`);
	if (response.bytes === 0) return routeFailure(path, "response body is empty");
}

async function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address === null || typeof address === "string") {
				server.close();
				reject(new Error("could not allocate a proof server port"));
				return;
			}
			const port = address.port;
			server.close((error) => (error === undefined ? resolve(port) : reject(error)));
		});
	});
}

function nextBinary(root: string): string {
	const path = join(root, "node_modules/.bin/next");
	if (!existsSync(path)) throw new Error(`missing Next binary: ${path}`);
	return path;
}

async function waitForServer(child: ChildProcess, url: string): Promise<void> {
	let output = "";
	child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
	child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
	for (let attempt = 0; attempt < 120; attempt++) {
		if (child.exitCode !== null)
			throw new Error(`Next server exited before becoming ready:\n${output}`);
		try {
			const response = await fetch(url, { redirect: "manual" });
			if (response.status > 0) {
				await response.body?.cancel();
				return;
			}
		} catch {
			// The server is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Next server did not become ready:\n${output}`);
}

async function startNextServer(root: string, port: number): Promise<NextServer> {
	const child = spawn(nextBinary(root), ["start", "-p", String(port)], {
		cwd: root,
		stdio: ["ignore", "pipe", "pipe"],
	});
	const url = `http://127.0.0.1:${port}`;
	try {
		await waitForServer(child, `${url}/`);
	} catch (error) {
		child.kill("SIGTERM");
		throw error;
	}
	return {
		url,
		close: () =>
			new Promise<void>((resolve, reject) => {
				const finish = (error?: Error) => (error === undefined ? resolve() : reject(error));
				child.once("exit", () => finish());
				child.once("error", finish);
				child.kill("SIGTERM");
			}),
	};
}

async function compareHttpRoutes(
	sourceServer: NextServer,
	targetServer: NextServer,
	routes: readonly string[],
): Promise<NextHttpProof> {
	const sourceFailures: NextProofFailure[] = [];
	const targetFailures: NextProofFailure[] = [];
	for (let index = 0; index < routes.length; index += 8) {
		const batch = routes.slice(index, index + 8);
		const [source, target] = await Promise.all([
			Promise.all(
				batch.map(async (path) => [path, await request(sourceServer.url, path)] as const),
			),
			Promise.all(
				batch.map(async (path) => [path, await request(targetServer.url, path)] as const),
			),
		]);
		for (const [path, response] of source) {
			const failure = checkHttpResponse(path, response);
			if (failure !== undefined) sourceFailures.push(failure);
		}
		for (const [path, response] of target) {
			const failure = checkHttpResponse(path, response);
			if (failure !== undefined) targetFailures.push(failure);
		}
	}
	return {
		checked: true,
		routeCount: routes.length,
		sourceFailures,
		targetFailures,
		routeSetEqual: true,
	};
}

async function compareRscRoutes(
	sourceServer: NextServer,
	targetServer: NextServer,
	routes: readonly string[],
): Promise<NextRscProof> {
	const sourceFailures: NextProofFailure[] = [];
	const targetFailures: NextProofFailure[] = [];
	let streamedRoutes = 0;
	const headers = (path: string) => ({
		RSC: "1",
		Accept: "text/x-component",
		"Next-Router-Prefetch": "1",
		"Next-Url": path,
	});
	for (let index = 0; index < routes.length; index += 4) {
		const batch = routes.slice(index, index + 4);
		const [source, target] = await Promise.all([
			Promise.all(
				batch.map(
					async (path) => [path, await request(sourceServer.url, path, headers(path))] as const,
				),
			),
			Promise.all(
				batch.map(
					async (path) => [path, await request(targetServer.url, path, headers(path))] as const,
				),
			),
		]);
		for (const [path, response] of source) {
			if (response.status !== 200)
				sourceFailures.push(routeFailure(path, `expected HTTP 200, got ${response.status}`));
			else if (response.contentType.split(";", 1)[0] !== "text/x-component")
				sourceFailures.push(
					routeFailure(path, `expected RSC content type, got ${response.contentType}`),
				);
			else if (response.bytes === 0 || response.chunks === 0)
				sourceFailures.push(routeFailure(path, "RSC stream is empty"));
		}
		for (const [path, response] of target) {
			if (response.status !== 200)
				targetFailures.push(routeFailure(path, `expected HTTP 200, got ${response.status}`));
			else if (response.contentType.split(";", 1)[0] !== "text/x-component")
				targetFailures.push(
					routeFailure(path, `expected RSC content type, got ${response.contentType}`),
				);
			else if (response.bytes === 0 || response.chunks === 0)
				targetFailures.push(routeFailure(path, "RSC stream is empty"));
			else streamedRoutes++;
		}
	}
	return {
		checked: true,
		routeCount: routes.length,
		sourceFailures,
		targetFailures,
		streamedRoutes,
	};
}

function textDigest(value: string): string {
	// `innerText` includes layout-dependent line breaks and spaces. Migrating
	// atomic styles can legitimately change those boundaries while preserving
	// the visible text sequence; stripping whitespace keeps this check focused
	// on rendered content rather than CSS display details.
	const normalized = value.replaceAll(/\s+/gu, "").trim();
	return createHash("sha256").update(normalized).digest("hex");
}

async function browserRoutes(
	repositoryRoot: string,
	sourceServer: NextServer,
	targetServer: NextServer,
	routes: readonly string[],
	ignoredConsoleErrorPatterns: readonly RegExp[] = [],
): Promise<NextBrowserProof> {
	const requireFromRoot = createRequire(join(repositoryRoot, "package.json"));
	const { chromium } = requireFromRoot("playwright-core") as typeof import("playwright-core");
	const browser = await chromium.launch();
	const page = await browser.newPage({ serviceWorkers: "block" });
	const failures: NextProofFailure[] = [];
	const pageErrors: NextProofFailure[] = [];
	const consoleErrors: NextProofFailure[] = [];
	const ignoredConsoleErrors: NextProofFailure[] = [];
	let currentPath = "";
	page.on("pageerror", (error) => pageErrors.push(routeFailure(currentPath, error.message)));
	page.on("console", (message) => {
		if (message.type() !== "error") return;
		const failure = routeFailure(currentPath, message.text());
		if (ignoredConsoleErrorPatterns.some((pattern) => pattern.test(message.text())))
			ignoredConsoleErrors.push(failure);
		else consoleErrors.push(failure);
	});
	const digests = new Map<string, { source?: string; target?: string }>();
	try {
		for (const [label, server] of [
			["source", sourceServer] as const,
			["target", targetServer] as const,
		]) {
			for (const path of routes) {
				currentPath = `${label}:${path}`;
				const response = await page.goto(`${server.url}${path}`, {
					waitUntil: "domcontentloaded",
					timeout: 30_000,
				});
				// Next's client navigation labels and RSC fallback state settle after
				// DOMContentLoaded. Keep this bounded instead of waiting for network
				// idle, because documentation pages prefetch an external course URL.
				await page.waitForTimeout(500);
				const expected = routeStatus(path);
				if (response?.status() !== expected) {
					failures.push(
						routeFailure(
							path,
							`${label} expected HTTP ${expected}, got ${response?.status() ?? "no response"}`,
						),
					);
					continue;
				}
				const body = await page.locator("body").innerText();
				if (body.trim() === "")
					failures.push(routeFailure(path, `${label} rendered an empty body`));
				const entry = digests.get(path) ?? {};
				entry[label] = textDigest(body);
				digests.set(path, entry);
			}
		}
	} finally {
		await browser.close();
	}
	for (const [path, digest] of digests) {
		if (digest.source !== digest.target)
			failures.push(routeFailure(path, "source and target rendered different visible text"));
	}
	return {
		checked: true,
		routeCount: routes.length,
		equivalent: failures.length === 0 && pageErrors.length === 0 && consoleErrors.length === 0,
		failures,
		pageErrors,
		consoleErrors,
		ignoredConsoleErrors,
	};
}

export async function proveNextInstallation(options: {
	readonly repositoryRoot: string;
	readonly sourceRoot: string;
	readonly targetRoot: string;
	readonly browserRoutes?: readonly string[];
	readonly ignoredConsoleErrorPatterns?: readonly RegExp[];
}): Promise<NextInstalledProof> {
	const sourceRoutes = readRoutes(options.sourceRoot);
	const targetRoutes = readRoutes(options.targetRoot);
	const routeSetEqual = JSON.stringify(sourceRoutes) === JSON.stringify(targetRoutes);
	const routes = [...new Set([...sourceRoutes, ...targetRoutes])].toSorted();
	const rscRoutes = routes.filter(isRscRoute);
	const browserRoutesToCheck = options.browserRoutes ?? rscRoutes;
	const sourceServer = await startNextServer(options.sourceRoot, await getFreePort());
	const targetServer = await startNextServer(options.targetRoot, await getFreePort());
	try {
		const [http, rsc, browser] = await Promise.all([
			compareHttpRoutes(sourceServer, targetServer, routes),
			compareRscRoutes(sourceServer, targetServer, rscRoutes),
			browserRoutes(
				options.repositoryRoot,
				sourceServer,
				targetServer,
				browserRoutesToCheck,
				options.ignoredConsoleErrorPatterns,
			),
		]);
		return {
			schema: NEXT_PROOF_SCHEMA,
			http: { ...http, routeSetEqual },
			rsc,
			browser,
		};
	} finally {
		await Promise.all([sourceServer.close(), targetServer.close()]);
	}
}
