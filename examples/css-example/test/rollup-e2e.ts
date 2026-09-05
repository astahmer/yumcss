import { createServer, type Server } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { transformSync } from "esbuild";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { rollup, type OutputChunk, type Plugin } from "rollup";
import { chromium } from "playwright-core";
import { examplePreset } from "pandwind/preset/example-preset";
import { pandwindRollupCss } from "pandwind/unplugin";

const repoRoot = resolve(import.meta.dirname, "../../..");

const RollupOutputKind = { Chunk: "chunk" } as const;

const isOutputChunk = (entry: { type: string }): entry is OutputChunk =>
	entry.type === RollupOutputKind.Chunk;

const tsPlugin: Plugin = {
	name: "rollup-e2e-typescript",
	transform(code, id) {
		if (!/\.(?:ts|tsx)$/.test(id)) return null;
		const result = transformSync(code, {
			loader: id.endsWith(".tsx") ? "tsx" : "ts",
			format: "esm",
			target: "es2022",
			sourcefile: id,
		});
		return { code: result.code, map: null };
	},
};

/** The host's CSS loader owns authored CSS; Rollup only needs its side effect. */
const authoredCssPlugin: Plugin = {
	name: "rollup-e2e-authored-css",
	resolveId(source, importer) {
		if (!source.endsWith(".css") || importer === undefined) return null;
		return resolve(dirname(importer), source);
	},
	load(id) {
		return id.endsWith(".css") ? "" : null;
	},
};

const contentType = (path: string): string => {
	if (extname(path) === ".html") return "text/html; charset=utf-8";
	if (extname(path) === ".js") return "text/javascript; charset=utf-8";
	return "text/css; charset=utf-8";
};

const serve = (root: string): Promise<{ server: Server; url: string }> =>
	new Promise((resolveServer) => {
		const server = createServer((request, response) => {
			const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
			const name = pathname === "/" ? "index.html" : pathname.slice(1);
			const file = resolve(root, name);
			try {
				response.writeHead(200, { "content-type": contentType(file) });
				response.end(readFileSync(file));
			} catch {
				response.writeHead(404);
				response.end("not found");
			}
		});
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address === null || typeof address === "string") throw new Error("Rollup server failed");
			resolveServer({ server, url: `http://127.0.0.1:${address.port}` });
		});
	});

const project = mkdtempSync(join(repoRoot, "rollup-css-example-"));
const source = join(project, "src");
mkdirSync(source, { recursive: true });
writeFileSync(
	join(source, "design.ts"),
	[
		'import { createDesignCss } from "pandwind/design";',
		'import { examplePreset } from "pandwind/preset/example-preset";',
		"export const dcss = createDesignCss(examplePreset);",
	].join("\n"),
);
writeFileSync(
	join(source, "globals.css"),
	"@keyframes rollup-fade { from { opacity: 0; } to { opacity: 1; } }\n" +
		".rollup-global { color: rgb(124, 45, 18); animation: rollup-fade 1ms; }\n",
);
writeFileSync(
	join(source, "entry.ts"),
	[
		'import "./globals.css";',
		'import { dcss } from "./design.ts";',
		'const staticClass = dcss.class({ $frame: { fill: "$blue-500" } });',
		'const duplicateClass = dcss.class({ $frame: { fill: "$blue-500" } });',
		'const dynamic = dcss.vars({ color: "#2563eb", _hover: { color: "#dc2626" } });',
		'document.querySelector("#static")!.className = staticClass;',
		'document.querySelector("#duplicate")!.className = duplicateClass;',
		'const target = document.querySelector("#dynamic")!;',
		"target.className = dynamic.class;",
		"for (const [key, value] of Object.entries(dynamic.style)) target.style.setProperty(key, value);",
	].join("\n"),
);
writeFileSync(
	join(project, "index.html"),
	'<!doctype html><link rel="stylesheet" href="/styles.css"><div id="static">static</div><div id="duplicate">duplicate</div><div id="dynamic">dynamic</div><div class="rollup-global" id="global">global</div><script type="module" src="/app.js"></script>',
);

let server: Server | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let serverUrl = "";
try {
	const cssPlugin = pandwindRollupCss({ preset: examplePreset, root: project });
	const bundle = await rollup({
		input: join(source, "entry.ts"),
		plugins: [cssPlugin, authoredCssPlugin, nodeResolve({ extensions: [".js", ".ts"] }), tsPlugin],
	});
	const output = await bundle.generate({ format: "es" });
	const app = output.output.find(isOutputChunk);
	if (app === undefined) throw new Error("Rollup emitted no application chunk");
	writeFileSync(join(project, "app.js"), app.code);
	const virtualId = cssPlugin.resolveId("pandwind:css");
	if (typeof virtualId !== "string") throw new Error("Rollup CSS virtual module did not resolve");
	const generated = cssPlugin.load(virtualId);
	if (typeof generated !== "string") throw new Error("Rollup CSS virtual module did not load");
	writeFileSync(
		join(project, "styles.css"),
		readFileSync(join(source, "globals.css"), "utf8") + generated,
	);
	await bundle.close();

	({ server, url: serverUrl } = await serve(project));
	browser = await chromium.launch();
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
	});
	page.on("pageerror", (error) => errors.push(String(error)));
	await page.goto(serverUrl, { waitUntil: "networkidle" });
	const staticColor = await page.$eval(
		"#static",
		(element) => getComputedStyle(element).backgroundColor,
	);
	const staticClass = await page.$eval("#static", (element) => element.className);
	const duplicateClass = await page.$eval("#duplicate", (element) => element.className);
	const globalColor = await page.$eval("#global", (element) => getComputedStyle(element).color);
	const animation = await page.$eval(
		"#global",
		(element) => getComputedStyle(element).animationName,
	);
	const dynamic = await page.$eval("#dynamic", (element) => ({
		color: getComputedStyle(element).color,
		className: element.className,
	}));
	await page.hover("#dynamic");
	const hoverColor = await page.$eval("#dynamic", (element) => getComputedStyle(element).color);
	const checks: Array<[string, boolean, string]> = [
		["Rollup extracts static atomic CSS", staticColor === "rgb(49, 130, 206)", staticColor],
		[
			"Rollup deduplicates duplicate atoms",
			duplicateClass === staticClass &&
				(generated.match(/background-color:#3182ce/g) ?? []).length === 1,
			`${staticClass} / ${duplicateClass} / ${generated.match(/background-color:#3182ce/g)?.length ?? 0} rules`,
		],
		["Rollup serves authored global CSS", globalColor === "rgb(124, 45, 18)", globalColor],
		["Rollup serves authored keyframes", animation === "rollup-fade", animation],
		["Rollup carries dynamic vars", dynamic.color === "rgb(37, 99, 235)", JSON.stringify(dynamic)],
		["Rollup conditional vars work in the browser", hoverColor === "rgb(220, 38, 38)", hoverColor],
		["Rollup fixture has no browser errors", errors.length === 0, errors.join(" | ")],
	];
	let failures = 0;
	for (const [name, ok, detail] of checks) {
		console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === "" ? "" : ` — ${detail}`}`);
		if (!ok) failures++;
	}
	if (failures > 0) process.exitCode = 1;
} finally {
	await browser?.close();
	server?.close();
	rmSync(project, { recursive: true, force: true });
}
