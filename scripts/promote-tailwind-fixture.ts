/**
 * Prove a small Tailwind project migration with the real CLI and installed
 * project dependencies. This is intentionally a bounded fixture: it checks
 * the complete project lifecycle without claiming that one button proves the
 * whole Tailwind language.
 */
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CodemodAdapterId } from "pandwind-codemod/swap";
import {
	parseInstalledProofMigration,
	type InstalledProofCanonicalEvidence,
} from "./installed-proof.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const pandwindPackageRoot = join(repositoryRoot, "packages/pandwind");
const proofSchema = "pandwind.installed-project-proof/1" as const;
const versions = {
	"@tailwindcss/vite": "4.3.3",
	"@tailwindcss/node": "4.3.3",
	"@types/react": "19.2.18",
	"@types/react-dom": "19.2.7",
	"@types/node": "26.4.1",
	"@vitejs/plugin-react-swc": "4.3.3",
	"oxc-parser": "0.148.0",
	pandwind: `file:${pandwindPackageRoot}`,
	react: "19.2.8",
	"react-dom": "19.2.8",
	tailwindcss: "4.3.3",
	typescript: "7.0.2",
	vite: "8.2.2",
} as const;

const sourceApp = `import "../styles.css";
import { Badge } from "./Badge";

export const App = () => (
	<div data-proof className="bg-brand px-4 py-2 text-white hover:bg-blue-600">
		<Badge />
		Proof
	</div>
);
`;

const sourceBadge = `export const Badge = () => (
	<span data-proof-badge className="ml-2 rounded bg-brand px-2 text-white hover:bg-blue-600">
		Badge
	</span>
);
`;

const sourceViteConfig = `import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [tailwindcss(), react()] });
`;

const tsConfig = {
	compilerOptions: {
		jsx: "react-jsx",
		lib: ["ESNext", "DOM", "DOM.Iterable"],
		module: "ESNext",
		moduleResolution: "Bundler",
		noEmit: true,
		target: "ES2022",
		strict: true,
		types: ["vite/client", "node"],
	},
	include: ["src", "vite.config.ts"],
};

interface BrowserProof {
	readonly checked: true;
	readonly states: readonly ["base", "hover"];
	readonly equivalent: boolean;
	readonly changedPixels: number;
	readonly computed: {
		readonly source: { readonly base: string; readonly hover: string };
		readonly target: { readonly base: string; readonly hover: string };
	};
	readonly hydrationErrors: readonly string[];
}

interface TailwindInstalledProof {
	readonly schema: typeof proofSchema;
	readonly route: {
		readonly from: CodemodAdapterId.Tailwind;
		readonly to: CodemodAdapterId.Pandwind;
	};
	readonly fixture: { readonly files: readonly string[]; readonly isolated: true };
	readonly dependencies: {
		readonly installed: boolean;
		readonly targetPackage: string;
		readonly targetNodeModule: boolean;
	};
	readonly migration: {
		readonly converted: number;
		readonly skipped: number;
		readonly residuals: number;
		readonly canonical: InstalledProofCanonicalEvidence;
		readonly generatedSupportFiles: number;
		readonly targetUsesPandwind: boolean;
		readonly customThemeTokenPreserved: boolean;
		readonly sourceStylesheetImportRemoved: boolean;
		readonly generatedVitePresetImportIsExplicit: boolean;
	};
	readonly checks: {
		readonly sourceTypecheck: boolean;
		readonly targetTypecheck: boolean;
		readonly sourceBuild: boolean;
		readonly targetBuild: boolean;
		readonly sourceSsr: boolean;
		readonly targetSsr: boolean;
		readonly hydration: boolean;
	};
	readonly ssr: {
		readonly markupEquivalent: boolean;
		readonly sourceMarkup: string;
		readonly targetMarkup: string;
	};
	readonly browser: BrowserProof;
	readonly css: {
		readonly sourceBytes: number;
		readonly targetBytes: number;
		readonly targetNotLarger: boolean;
	};
}

function proofIsComplete(report: TailwindInstalledProof): boolean {
	return (
		report.migration.skipped === 0 &&
		report.migration.residuals === 0 &&
		report.migration.canonical.checked &&
		report.migration.canonical.equal &&
		report.migration.targetUsesPandwind &&
		report.migration.customThemeTokenPreserved &&
		report.migration.sourceStylesheetImportRemoved &&
		report.migration.generatedVitePresetImportIsExplicit &&
		report.dependencies.targetNodeModule &&
		report.ssr.markupEquivalent &&
		report.browser.equivalent &&
		report.css.sourceBytes > 0 &&
		report.css.targetBytes > 0
	);
}

function run(command: string, args: readonly string[], cwd: string): void {
	execFileSync(command, [...args], { cwd, stdio: "inherit" });
}

function runCaptured(command: string, args: readonly string[], cwd: string): string {
	const output = execFileSync(command, [...args], { cwd, encoding: "utf8" });
	process.stdout.write(output);
	return output;
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`);
}

function packageJson(includePandwind: boolean): Record<string, unknown> {
	return {
		private: true,
		type: "module",
		scripts: {
			build: "vite build",
			ssr: "vite build --ssr src/entry-server.tsx",
			typecheck: "tsc --noEmit",
		},
		dependencies: {
			...(includePandwind ? { pandwind: versions.pandwind } : {}),
			react: versions.react,
			"react-dom": versions["react-dom"],
			tailwindcss: versions.tailwindcss,
		},
		devDependencies: {
			"@tailwindcss/node": versions["@tailwindcss/node"],
			"@tailwindcss/vite": versions["@tailwindcss/vite"],
			"@types/node": versions["@types/node"],
			"@types/react": versions["@types/react"],
			"@types/react-dom": versions["@types/react-dom"],
			"@vitejs/plugin-react-swc": versions["@vitejs/plugin-react-swc"],
			...(includePandwind ? { "oxc-parser": versions["oxc-parser"] } : {}),
			typescript: versions.typescript,
			vite: versions.vite,
		},
	};
}

function createFixture(root: string, includePandwind: boolean): void {
	mkdirSync(join(root, "src"), { recursive: true });
	writeJson(join(root, "package.json"), packageJson(includePandwind));
	writeJson(join(root, "tsconfig.json"), tsConfig);
	writeFileSync(
		join(root, "styles.css"),
		['@import "tailwindcss";', "", "@theme { --color-brand: #123456; }"].join("\n") + "\n",
	);
	writeFileSync(join(root, "vite.config.ts"), sourceViteConfig);
	writeFileSync(join(root, "src/App.tsx"), sourceApp);
	writeFileSync(join(root, "src/Badge.tsx"), sourceBadge);
	writeFileSync(
		join(root, "src/main.tsx"),
		[
			'import { hydrateRoot } from "react-dom/client";',
			'import { App } from "./App";',
			"",
			'hydrateRoot(document.getElementById("root")!, <App />);',
		].join("\n"),
	);
	writeFileSync(join(root, "src/entry-server.tsx"), 'export { App } from "./App";\n');
	writeFileSync(
		join(root, "index.html"),
		'<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
	);
}

function allFiles(root: string): string[] {
	const output: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) output.push(...allFiles(path));
		else output.push(path);
	}
	return output;
}

function findFile(root: string, name: string): string {
	const file = allFiles(root).find((candidate) => candidate.endsWith(name));
	if (file === undefined) throw new Error(`could not find ${name} below ${root}`);
	return file;
}

async function renderServerAsync(root: string): Promise<string> {
	run("pnpm", ["run", "ssr"], root);
	const serverBundle = findFile(join(root, "dist"), "entry-server.js");
	const requireFromProject = createRequire(join(root, "package.json"));
	const React = requireFromProject("react") as typeof import("react");
	const renderToStaticMarkup = requireFromProject("react-dom/server").renderToStaticMarkup as (
		element: unknown,
	) => string;
	const module = (await import(pathToFileURL(serverBundle).href)) as { readonly App: unknown };
	return renderToStaticMarkup(React.createElement(module.App));
}

function writeIndex(root: string, markup: string): void {
	writeFileSync(
		join(root, "index.html"),
		`<div id="root">${markup}</div><script type="module" src="/src/main.tsx"></script>\n`,
	);
}

function generatedCss(root: string): string {
	return allFiles(join(root, "dist"))
		.filter((file) => file.endsWith(".css"))
		.toSorted()
		.map((file) => readFileSync(file, "utf8"))
		.join("\n");
}

async function staticServer(root: string): Promise<{
	readonly url: string;
	readonly close: () => Promise<void>;
}> {
	const server = createServer((request, response) => {
		const pathname = decodeURIComponent((request.url ?? "/").split("?", 1)[0]);
		const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\//u, "");
		const file = resolve(root, "dist", relativePath);
		if (!file.startsWith(`${resolve(root, "dist")}/`)) {
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

async function browserProof(sourceRoot: string, targetRoot: string): Promise<BrowserProof> {
	const requireFromShowcase = createRequire(join(repositoryRoot, "examples/showcase/package.json"));
	const { chromium } = requireFromShowcase("playwright-core") as typeof import("playwright-core");
	const pixelmatchModule = requireFromShowcase("pixelmatch") as
		| typeof import("pixelmatch")
		| { readonly default: typeof import("pixelmatch") };
	const pixelmatch =
		typeof pixelmatchModule === "function" ? pixelmatchModule : pixelmatchModule.default;
	const { PNG } = requireFromShowcase("pngjs") as typeof import("pngjs");
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 640, height: 240 } });
	const hydrationErrors: string[] = [];
	page.on("pageerror", (error) => hydrationErrors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") hydrationErrors.push(message.text());
	});
	const sourceServer = await staticServer(sourceRoot);
	const targetServer = await staticServer(targetRoot);
	const states = ["base", "hover"] as const;
	const screenshots: Buffer[] = [];
	const computed: Record<"source" | "target", { base: string; hover: string }> = {
		source: { base: "", hover: "" },
		target: { base: "", hover: "" },
	};
	try {
		for (const [label, server] of [
			["source", sourceServer] as const,
			["target", targetServer] as const,
		]) {
			for (const state of states) {
				await page.goto(server.url, { waitUntil: "networkidle" });
				await page.addStyleTag({
					content:
						"html, body, #root { margin: 0; padding: 0; } #root { width: 640px; } [data-proof] { box-sizing: border-box; display: block; font: 16px/24px Arial, sans-serif; height: 56px; margin: 0; width: 160px; }",
				});
				if (state === "hover") await page.hover("[data-proof]");
				computed[label][state] = await page.$eval("[data-proof]", (element) => {
					const style = getComputedStyle(element);
					return [style.backgroundColor, style.color, style.paddingLeft, style.paddingTop].join(
						"|",
					);
				});
				screenshots.push(await page.locator("[data-proof]").screenshot());
			}
		}
	} finally {
		await sourceServer.close();
		await targetServer.close();
		await browser.close();
	}
	const sourceBase = PNG.sync.read(screenshots[0]);
	const sourceHover = PNG.sync.read(screenshots[1]);
	const targetBase = PNG.sync.read(screenshots[2]);
	const targetHover = PNG.sync.read(screenshots[3]);
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
			{
				threshold: 0.1,
			},
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
	};
}

export async function runTailwindInstalledProof(): Promise<TailwindInstalledProof> {
	run("nub", ["run", "--filter", "pandwind", "build"], repositoryRoot);
	const root = mkdtempSync(join(tmpdir(), "pandwind-tailwind-installed-proof-"));
	const sourceRoot = join(root, "source");
	const targetRoot = join(root, "target");
	createFixture(sourceRoot, false);
	createFixture(targetRoot, true);
	run("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], sourceRoot);
	run("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], targetRoot);
	run("pnpm", ["run", "typecheck"], sourceRoot);
	const migration = parseInstalledProofMigration(
		runCaptured(
			"nub",
			[
				"--conditions",
				"pandwind",
				join(repositoryRoot, "packages/codemod/src/cli.ts"),
				"migrate",
				"--from",
				"tailwindcss",
				"--to",
				"pandwind",
				"--root",
				targetRoot,
				"--no-install",
				"src/**/*.tsx",
				"--report",
				"--report-format=json",
			],
			repositoryRoot,
		),
		"Tailwind",
	);
	const migratedApp = readFileSync(join(targetRoot, "src/App.tsx"), "utf8");
	const generatedSupportFiles = allFiles(join(targetRoot, "pandwind")).map((file) =>
		relative(targetRoot, file).replaceAll("\\", "/"),
	);
	const installedTargetPackage = JSON.parse(
		readFileSync(join(targetRoot, "package.json"), "utf8"),
	) as { dependencies?: Record<string, string> };
	const targetViteConfig = readFileSync(join(targetRoot, "vite.config.ts"), "utf8");
	const sourceMarkup = await renderServerAsync(sourceRoot);
	writeIndex(sourceRoot, sourceMarkup);
	run("pnpm", ["run", "build"], sourceRoot);
	const sourceCss = generatedCss(sourceRoot);
	const targetMarkup = await renderServerAsync(targetRoot);
	writeIndex(targetRoot, targetMarkup);
	run("pnpm", ["run", "typecheck"], targetRoot);
	run("pnpm", ["run", "build"], targetRoot);
	const targetCss = generatedCss(targetRoot);
	const browser = await browserProof(sourceRoot, targetRoot);
	const normalizeMarkup = (markup: string): string =>
		markup.replace(/class="[^"]*"/gu, 'class="CLASS"');
	const result: TailwindInstalledProof = {
		schema: proofSchema,
		route: { from: CodemodAdapterId.Tailwind, to: CodemodAdapterId.Pandwind },
		fixture: {
			files: ["src/App.tsx", "src/Badge.tsx", "styles.css", "vite.config.ts"],
			isolated: true,
		},
		dependencies: {
			installed: true,
			targetPackage: installedTargetPackage.dependencies?.pandwind ?? "",
			targetNodeModule: existsSync(join(targetRoot, "node_modules/pandwind/package.json")),
		},
		migration: {
			converted: migration.converted,
			skipped: migration.skipped,
			residuals: migration.residuals,
			canonical: migration.canonical,
			generatedSupportFiles: generatedSupportFiles.length,
			targetUsesPandwind: migratedApp.includes("pandwind"),
			customThemeTokenPreserved:
				migratedApp.includes('backgroundColor: "$brand"') ||
				migratedApp.includes('backgroundColor: "brand"'),
			sourceStylesheetImportRemoved: !migratedApp.includes("../styles.css"),
			generatedVitePresetImportIsExplicit: targetViteConfig.includes("./pandwind/preset.ts"),
		},
		checks: {
			sourceTypecheck: true,
			targetTypecheck: true,
			sourceBuild: true,
			targetBuild: true,
			sourceSsr: true,
			targetSsr: true,
			hydration: browser.hydrationErrors.length === 0,
		},
		ssr: {
			markupEquivalent: normalizeMarkup(sourceMarkup) === normalizeMarkup(targetMarkup),
			sourceMarkup,
			targetMarkup,
		},
		browser,
		css: {
			sourceBytes: Buffer.byteLength(sourceCss),
			targetBytes: Buffer.byteLength(targetCss),
			targetNotLarger: Buffer.byteLength(targetCss) <= Buffer.byteLength(sourceCss),
		},
	};
	if (proofIsComplete(result)) rmSync(root, { recursive: true, force: true });
	else console.error(`kept failed Tailwind proof fixture for inspection: ${root}`);
	return result;
}

if (import.meta.main) {
	const report = await runTailwindInstalledProof();
	const output = join(repositoryRoot, "plans/evidence/tailwind-installed-proof.json");
	mkdirSync(dirname(output), { recursive: true });
	writeJson(output, report);
	console.log(JSON.stringify(report, null, 2));
	console.error(`wrote installed Tailwind proof: ${output}`);
	if (!proofIsComplete(report)) process.exitCode = 1;
}
