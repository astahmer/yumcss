import { createServer } from "node:http";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface InstalledProofCanonicalEvidence {
	readonly checked: boolean;
	readonly equal: boolean;
	readonly sourceBytes: number;
	readonly targetBytes: number;
	readonly differences: readonly string[];
}

export interface InstalledProofMigrationSummary {
	readonly converted: number;
	readonly skipped: number;
	readonly residuals: number;
	readonly canonical: InstalledProofCanonicalEvidence;
}

interface InstalledCliReport {
	readonly files?: readonly {
		readonly converted?: number;
		readonly skipped?: number;
		readonly residuals?: number;
		readonly canonical?: InstalledProofCanonicalEvidence;
	}[];
}

export interface InstalledProofBrowserEvidence {
	readonly checked: true;
	readonly states: readonly ["base", "hover"];
	readonly equivalent: boolean;
	readonly changedPixels: number;
	readonly computed: {
		readonly source: { readonly base: string; readonly hover: string };
		readonly target: { readonly base: string; readonly hover: string };
	};
	readonly hydrationErrors: readonly string[];
	readonly runtimeStyleBytes?: { readonly source: number; readonly target: number };
}

export interface InstalledProofProject {
	readonly root: string;
	readonly sourceRoot: string;
	readonly targetRoot: string;
}

interface InstalledProofProjectOptions<T> {
	readonly retain?: (result: T) => boolean;
	readonly retainOnError?: boolean;
}

interface InstalledServer {
	readonly url: string;
	readonly close: () => Promise<void>;
}

type Pixelmatch = (
	imageA: Uint8Array | Uint8ClampedArray,
	imageB: Uint8Array | Uint8ClampedArray,
	output: Uint8Array | Uint8ClampedArray,
	width: number,
	height: number,
	options?: { readonly threshold?: number },
) => number;

interface PngImage {
	readonly data: Uint8Array;
	readonly width: number;
	readonly height: number;
}

interface PngApi {
	new (options: { readonly width: number; readonly height: number }): PngImage;
	readonly sync: { readonly read: (input: Buffer) => PngImage };
}

export function run(command: string, args: readonly string[], cwd: string): void {
	execFileSync(command, [...args], { cwd, stdio: "inherit" });
}

export function runCaptured(command: string, args: readonly string[], cwd: string): string {
	const result = spawnSync(command, [...args], { cwd, encoding: "utf8" });
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	process.stdout.write(output);
	if (result.error !== undefined) throw result.error;
	if (result.status !== 0) throw new Error(`Command failed: ${command} ${args.join(" ")}`);
	return output;
}

export function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`);
}

export function packageInstalled(root: string, packageName: string): boolean {
	return existsSync(join(root, "node_modules", ...packageName.split("/")));
}

export function allFiles(root: string): string[] {
	const output: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) output.push(...allFiles(path));
		else output.push(path);
	}
	return output;
}

export function findFile(root: string, name: string): string {
	const file = allFiles(root).find((candidate) => candidate.endsWith(name));
	if (file === undefined) throw new Error(`could not find ${name} below ${root}`);
	return file;
}

export function generatedCss(root: string): string {
	return allFiles(join(root, "dist"))
		.filter((file) => file.endsWith(".css"))
		.toSorted()
		.map((file) => readFileSync(file, "utf8"))
		.join("\n");
}

export function writeIndex(root: string, markup: string, css = ""): void {
	writeFileSync(
		join(root, "index.html"),
		`${css === "" ? "" : `<style>${css}</style>`}<div id="root">${markup}</div><script type="module" src="/src/main.tsx"></script>\n`,
	);
}

export async function renderInstalledServer(
	root: string,
	options: {
		readonly renderer?: "static" | "string";
		readonly collectStyledComponents?: boolean;
		readonly collectAphrodite?: boolean;
	} = {},
): Promise<{ readonly markup: string; readonly css: string }> {
	run("pnpm", ["run", "ssr"], root);
	const serverBundle = findFile(join(root, "dist"), "entry-server.js");
	const requireFromProject = createRequire(join(root, "package.json"));
	const React = requireFromProject("react") as {
		readonly createElement: (type: unknown) => unknown;
	};
	const render =
		options.renderer === "static"
			? (requireFromProject("react-dom/server").renderToStaticMarkup as (
					element: unknown,
				) => string)
			: (requireFromProject("react-dom/server").renderToString as (element: unknown) => string);
	const module = (await import(pathToFileURL(serverBundle).href)) as {
		readonly App: unknown;
		readonly pandwindCss?: string | (() => string);
		readonly stitchesCss?: string | (() => string);
		readonly sourceCss?: string | (() => string);
	};
	const element = React.createElement(module.App);
	if (options.collectAphrodite === true) {
		const renderStatic = requireFromProject("aphrodite").StyleSheetServer.renderStatic as (
			render: () => string,
		) => { readonly html: string; readonly css: { readonly content: string } };
		const rendered = renderStatic(() => render(element));
		return { markup: rendered.html, css: rendered.css.content };
	}
	const markup = render(element);
	if (module.pandwindCss !== undefined) {
		return {
			markup,
			css: typeof module.pandwindCss === "function" ? module.pandwindCss() : module.pandwindCss,
		};
	}
	if (module.stitchesCss !== undefined) {
		return {
			markup,
			css: typeof module.stitchesCss === "function" ? module.stitchesCss() : module.stitchesCss,
		};
	}
	if (module.sourceCss !== undefined) {
		return {
			markup,
			css: typeof module.sourceCss === "function" ? module.sourceCss() : module.sourceCss,
		};
	}
	if (!options.collectStyledComponents) return { markup, css: "" };
	const ServerStyleSheet = requireFromProject("styled-components").ServerStyleSheet as new () => {
		collectStyles(element: unknown): unknown;
		getStyleTags(): string;
		seal(): void;
	};
	const sheet = new ServerStyleSheet();
	try {
		return {
			markup: render(sheet.collectStyles(element)),
			css: sheet.getStyleTags().replace(/<style[^>]*>|<\/style>/gu, ""),
		};
	} finally {
		sheet.seal();
	}
}

async function staticServer(root: string): Promise<InstalledServer> {
	const distRoot = resolve(root, "dist");
	const server = createServer((request, response) => {
		const pathname = decodeURIComponent((request.url ?? "/").split("?", 1)[0] ?? "/");
		const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\//u, "");
		const file = resolve(distRoot, relativePath);
		if (!file.startsWith(`${distRoot}/`)) {
			response.writeHead(403).end();
			return;
		}
		try {
			const contentType = {
				".css": "text/css; charset=utf-8",
				".html": "text/html; charset=utf-8",
				".js": "text/javascript; charset=utf-8",
				".svg": "image/svg+xml",
			}[extname(file)];
			if (contentType !== undefined) response.setHeader("content-type", contentType);
			response.writeHead(200).end(readFileSync(file));
		} catch {
			response.writeHead(404).end();
		}
	});
	await new Promise<void>((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
	const address = server.address();
	if (address === null || typeof address === "string")
		throw new Error("proof server has no address");
	return {
		url: `http://127.0.0.1:${address.port}/`,
		close: () =>
			new Promise<void>((resolveServer, reject) =>
				server.close((error) => (error ? reject(error) : resolveServer())),
			),
	};
}

export async function browserProof(options: {
	readonly repositoryRoot: string;
	readonly sourceRoot: string;
	readonly targetRoot: string;
	readonly resetStyles: string;
	readonly computedProperties: readonly string[];
	readonly collectRuntimeStyleBytes?: boolean;
}): Promise<InstalledProofBrowserEvidence> {
	const requireFromRoot = createRequire(
		join(options.repositoryRoot, "examples/showcase/package.json"),
	);
	const { chromium } = requireFromRoot("playwright-core") as typeof import("playwright-core");
	const pixelmatchModule = requireFromRoot("pixelmatch") as
		| typeof import("pixelmatch")
		| { readonly default: typeof import("pixelmatch") };
	const pixelmatch = (typeof pixelmatchModule === "function"
		? pixelmatchModule
		: pixelmatchModule.default) as unknown as Pixelmatch;
	const { PNG } = requireFromRoot("pngjs") as { readonly PNG: PngApi };
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 640, height: 240 } });
	const hydrationErrors: string[] = [];
	page.on("pageerror", (error) => hydrationErrors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") hydrationErrors.push(message.text());
	});
	const sourceServer = await staticServer(options.sourceRoot);
	const targetServer = await staticServer(options.targetRoot);
	const states = ["base", "hover"] as const;
	const screenshots: Buffer[] = [];
	const computed: Record<"source" | "target", { base: string; hover: string }> = {
		source: { base: "", hover: "" },
		target: { base: "", hover: "" },
	};
	const runtimeStyleBytes: Record<"source" | "target", number> = { source: 0, target: 0 };
	try {
		for (const [label, server] of [
			["source", sourceServer] as const,
			["target", targetServer] as const,
		]) {
			for (const state of states) {
				await page.goto(server.url, { waitUntil: "networkidle" });
				await page.addStyleTag({ content: options.resetStyles });
				if (state === "base" && options.collectRuntimeStyleBytes === true) {
					runtimeStyleBytes[label] = await page.evaluate(() =>
						[...document.querySelectorAll("style")].reduce(
							(total, element) =>
								total + new TextEncoder().encode(element.textContent ?? "").byteLength,
							0,
						),
					);
				}
				if (state === "hover") await page.hover("[data-proof]");
				computed[label][state] = await page.$eval(
					"[data-proof]",
					(element, properties) => {
						const style = getComputedStyle(element);
						return properties.map((property) => style.getPropertyValue(property)).join("|");
					},
					options.computedProperties,
				);
				screenshots.push(await page.locator("[data-proof]").screenshot());
			}
		}
	} finally {
		await sourceServer.close();
		await targetServer.close();
		await browser.close();
	}
	const sourceBase = PNG.sync.read(screenshots[0]!);
	const sourceHover = PNG.sync.read(screenshots[1]!);
	const targetBase = PNG.sync.read(screenshots[2]!);
	const targetHover = PNG.sync.read(screenshots[3]!);
	const diff = new PNG({ width: sourceBase.width, height: sourceBase.height });
	const changedPixels =
		pixelmatch(sourceBase.data, targetBase.data, diff.data, sourceBase.width, sourceBase.height, {
			threshold: 0.1,
		}) +
		pixelmatch(
			sourceHover.data,
			targetHover.data,
			diff.data,
			sourceHover.width,
			sourceHover.height,
			{ threshold: 0.1 },
		);
	return {
		checked: true,
		states,
		equivalent:
			changedPixels === 0 &&
			computed.source.base === computed.target.base &&
			computed.source.hover === computed.target.hover &&
			hydrationErrors.length === 0,
		changedPixels,
		computed,
		hydrationErrors,
		...(options.collectRuntimeStyleBytes === true
			? {
					runtimeStyleBytes: { source: runtimeStyleBytes.source, target: runtimeStyleBytes.target },
				}
			: {}),
	};
}

export async function withInstalledProofProject<T>(
	prefix: string,
	callback: (project: InstalledProofProject) => Promise<T>,
	options: InstalledProofProjectOptions<T> = {},
): Promise<T> {
	const root = mkdtempSync(join(tmpdir(), prefix));
	const project: InstalledProofProject = {
		root,
		sourceRoot: join(root, "source"),
		targetRoot: join(root, "target"),
	};
	try {
		const result = await callback(project);
		if (options.retain?.(result))
			console.error(`kept failed proof fixture for inspection: ${root}`);
		else rmSync(root, { recursive: true, force: true });
		return result;
	} catch (error) {
		if (options.retainOnError) console.error(`kept failed proof fixture for inspection: ${root}`);
		else rmSync(root, { recursive: true, force: true });
		throw error;
	}
}

/** Parse the machine-readable CLI report used by installed migration proofs. */
export function parseInstalledProofMigration(
	output: string,
	label: string,
): InstalledProofMigrationSummary {
	let report: InstalledCliReport;
	try {
		report = JSON.parse(output.trim()) as InstalledCliReport;
	} catch (error) {
		throw new Error(`installed ${label} proof received invalid codemod JSON`, { cause: error });
	}
	const files = report.files ?? [];
	if (
		files.length === 0 ||
		files.some(
			(file) =>
				typeof file.converted !== "number" ||
				typeof file.skipped !== "number" ||
				typeof file.residuals !== "number" ||
				file.canonical === undefined,
		)
	) {
		throw new Error(`installed ${label} proof received an incomplete codemod report`);
	}
	const canonicalFiles = files
		.map((file) => file.canonical!)
		.filter((canonical) => canonical.checked);
	if (canonicalFiles.length === 0)
		throw new Error(`installed ${label} proof received no canonical migration evidence`);
	return {
		converted: files.reduce((total, file) => total + file.converted!, 0),
		skipped: files.reduce((total, file) => total + file.skipped!, 0),
		residuals: files.reduce((total, file) => total + file.residuals!, 0),
		canonical: {
			checked: canonicalFiles.every((canonical) => canonical.checked),
			equal: canonicalFiles.every((canonical) => canonical.equal),
			sourceBytes: canonicalFiles.reduce((total, canonical) => total + canonical.sourceBytes, 0),
			targetBytes: canonicalFiles.reduce((total, canonical) => total + canonical.targetBytes, 0),
			differences: canonicalFiles.flatMap((canonical) => canonical.differences),
		},
	};
}
