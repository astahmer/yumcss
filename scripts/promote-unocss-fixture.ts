/**
 * Prove a bounded UnoCSS -> Pandwind project migration with the real CLI and
 * installed UnoCSS generator output. The fixture covers a custom color token,
 * spacing utilities, a pseudo-condition, generated project support, and the
 * source/target build boundary.
 */
import { createServer } from "node:http";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
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
	"@types/node": "26.4.1",
	"@types/react": "19.2.18",
	"@types/react-dom": "19.2.7",
	"@vitejs/plugin-react-swc": "4.3.3",
	"oxc-parser": "0.148.0",
	pandwind: `file:${pandwindPackageRoot}`,
	react: "19.2.8",
	"react-dom": "19.2.8",
	typescript: "7.0.2",
	unocss: "66.10.0",
	vite: "8.2.2",
} as const;

const unoConfig = `import { defineConfig } from "unocss";
import { presetWind3 } from "unocss/preset-wind3";

export default defineConfig({
	presets: [presetWind3()],
	theme: {
		colors: { brand: "#123456" },
	},
});
`;

const sourceApp = `export const App = () => (
	<button
		className="bg-brand px-4 py-2 text-white hover:bg-blue-600 rounded-md"
		data-proof
	>
		Proof
	</button>
);
`;

const sourceViteConfig = `import react from "@vitejs/plugin-react-swc";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [UnoCSS(), react()] });
`;

const tsConfig = {
	compilerOptions: {
		jsx: "react-jsx",
		lib: ["ESNext", "DOM", "DOM.Iterable"],
		module: "ESNext",
		moduleResolution: "Bundler",
		noEmit: true,
		// UnoCSS 66 publishes a transitive unconfig declaration that references
		// an internal helper type; keep dependency checking at the package
		// boundary while checking the fixture and migrated source strictly.
		skipLibCheck: true,
		target: "ES2022",
		strict: true,
		types: ["vite/client", "node"],
	},
	include: ["src", "vite.config.ts", "uno.config.ts"],
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

interface UnoCssInstalledProof {
	readonly schema: typeof proofSchema;
	readonly route: {
		readonly from: CodemodAdapterId.UnoCSS;
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
		readonly targetUsesPandwind: boolean;
		readonly customTokenPreserved: boolean;
		readonly sourceStylesheetImportRemoved: boolean;
		readonly generatedVitePresetImportIsExplicit: boolean;
		readonly generatedVitePluginPresent: boolean;
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
	readonly ssr: { readonly markupEquivalent: boolean };
	readonly browser: BrowserProof;
	readonly css: {
		readonly sourceBytes: number;
		readonly targetBytes: number;
		readonly targetNotLarger: boolean;
	};
}

function proofIsComplete(report: UnoCssInstalledProof): boolean {
	return (
		report.migration.converted > 0 &&
		report.migration.skipped === 0 &&
		report.migration.residuals === 0 &&
		report.migration.canonical.checked &&
		report.migration.canonical.equal &&
		report.migration.targetUsesPandwind &&
		report.migration.customTokenPreserved &&
		report.migration.sourceStylesheetImportRemoved &&
		report.migration.generatedVitePresetImportIsExplicit &&
		report.migration.generatedVitePluginPresent &&
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
	const result = spawnSync(command, [...args], { cwd, encoding: "utf8" });
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	process.stdout.write(output);
	if (result.status !== 0) throw new Error(`Command failed: ${command} ${args.join(" ")}`);
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
			unocss: versions.unocss,
			...(includePandwind ? { pandwind: versions.pandwind } : {}),
			react: versions.react,
			"react-dom": versions["react-dom"],
		},
		devDependencies: {
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
	writeFileSync(join(root, "uno.config.ts"), unoConfig);
	writeFileSync(join(root, "vite.config.ts"), sourceViteConfig);
	writeFileSync(join(root, "src/App.tsx"), sourceApp);
	writeFileSync(
		join(root, "src/main.tsx"),
		[
			'import "virtual:uno.css";',
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

function packageInstalled(root: string, packageName: string): boolean {
	return existsSync(join(root, "node_modules", ...packageName.split("/")));
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

async function renderServerAsync(root: string): Promise<{ readonly markup: string }> {
	run("pnpm", ["run", "ssr"], root);
	const serverBundle = findFile(join(root, "dist"), "entry-server.js");
	const requireFromProject = createRequire(join(root, "package.json"));
	const React = requireFromProject("react") as typeof import("react");
	const renderToString = requireFromProject("react-dom/server").renderToString as (
		element: unknown,
	) => string;
	const module = (await import(pathToFileURL(serverBundle).href)) as { readonly App: unknown };
	return { markup: renderToString(React.createElement(module.App)) };
}

function writeIndex(root: string, markup: string, css = ""): void {
	writeFileSync(
		join(root, "index.html"),
		`${css === "" ? "" : `<style>${css}</style>`}<div id="root">${markup}</div><script type="module" src="/src/main.tsx"></script>\n`,
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
		const pathname = decodeURIComponent((request.url ?? "/").split("?", 1)[0]!);
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
	const requireFromRoot = createRequire(join(repositoryRoot, "examples/showcase/package.json"));
	const { chromium } = requireFromRoot("playwright-core") as typeof import("playwright-core");
	const pixelmatchModule = requireFromRoot("pixelmatch") as
		| typeof import("pixelmatch")
		| { readonly default: typeof import("pixelmatch") };
	const pixelmatch =
		typeof pixelmatchModule === "function" ? pixelmatchModule : pixelmatchModule.default;
	const { PNG } = requireFromRoot("pngjs") as typeof import("pngjs");
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
						"html, body, #root { margin: 0; padding: 0; } #root { width: 640px; } [data-proof] { appearance: none; border: 0; box-sizing: border-box; display: block; font: 16px/24px Arial, sans-serif; height: 56px; margin: 0; width: 160px; }",
				});
				if (state === "hover") await page.hover("[data-proof]");
				computed[label][state] = await page.$eval("[data-proof]", (element) => {
					const style = getComputedStyle(element);
					return [style.backgroundColor, style.color, style.paddingLeft, style.borderRadius].join(
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

async function main(): Promise<void> {
	const root = mkdtempSync(join(tmpdir(), "pandwind-unocss-installed-"));
	const sourceRoot = join(root, "source");
	const targetRoot = join(root, "target");
	try {
		createFixture(sourceRoot, false);
		run("pnpm", ["install", "--ignore-scripts"], sourceRoot);
		run("pnpm", ["run", "typecheck"], sourceRoot);
		run("pnpm", ["run", "build"], sourceRoot);
		createTargetFixture(sourceRoot, targetRoot);
		run("pnpm", ["install", "--ignore-scripts"], targetRoot);
		const migration = parseInstalledProofMigration(
			runCaptured(
				"nub",
				[
					"--conditions",
					"pandwind",
					"packages/codemod/src/cli.ts",
					"migrate",
					"--from",
					CodemodAdapterId.UnoCSS,
					"--to",
					CodemodAdapterId.Pandwind,
					"--root",
					targetRoot,
					"--no-install",
					"src/App.tsx",
					"--report",
					"--report-format=json",
				],
				repositoryRoot,
			),
			"UnoCSS",
		);
		run("pnpm", ["run", "typecheck"], targetRoot);
		const migratedApp = readFileSync(join(targetRoot, "src/App.tsx"), "utf8");
		const targetMain = readFileSync(join(targetRoot, "src/main.tsx"), "utf8");
		const viteConfig = readFileSync(join(targetRoot, "vite.config.ts"), "utf8");
		const preset = readFileSync(join(targetRoot, "pandwind/preset.ts"), "utf8");
		const sourceCss = generatedCss(sourceRoot);
		const sourceSsr = await renderServerAsync(sourceRoot);
		writeIndex(sourceRoot, sourceSsr.markup, sourceCss);
		run("pnpm", ["run", "build"], sourceRoot);
		const targetSsr = await renderServerAsync(targetRoot);
		writeIndex(targetRoot, targetSsr.markup);
		run("pnpm", ["run", "build"], targetRoot);
		const browser = await browserProof(sourceRoot, targetRoot);
		const normalizeMarkup = (markup: string): string =>
			markup.replace(/\s+(?:class|data-proof)="[^"]*"/gu, "");
		const targetCss = generatedCss(targetRoot);
		const report: UnoCssInstalledProof = {
			schema: proofSchema,
			route: { from: CodemodAdapterId.UnoCSS, to: CodemodAdapterId.Pandwind },
			fixture: { files: ["uno.config.ts", "src/App.tsx", "vite.config.ts"], isolated: true },
			dependencies: {
				installed: packageInstalled(sourceRoot, "unocss"),
				targetPackage: `file:${pandwindPackageRoot}`,
				targetNodeModule: packageInstalled(targetRoot, "pandwind"),
			},
			migration: {
				...migration,
				targetUsesPandwind: migratedApp.includes("pandwind"),
				customTokenPreserved:
					preset.includes("123456") &&
					(migratedApp.includes('"$brand"') || migratedApp.includes('"brand"')),
				sourceStylesheetImportRemoved: !targetMain.includes("virtual:uno.css"),
				generatedVitePresetImportIsExplicit: viteConfig.includes("./pandwind/preset.ts"),
				generatedVitePluginPresent: viteConfig.includes("pandwindCssVite"),
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
				markupEquivalent: normalizeMarkup(sourceSsr.markup) === normalizeMarkup(targetSsr.markup),
			},
			browser,
			css: {
				sourceBytes: Buffer.byteLength(sourceCss),
				targetBytes: Buffer.byteLength(targetCss),
				targetNotLarger: Buffer.byteLength(targetCss) <= Buffer.byteLength(sourceCss),
			},
		};
		if (!proofIsComplete(report)) {
			console.error("incomplete UnoCSS proof:", JSON.stringify(report, null, 2));
			throw new Error(`UnoCSS migration did not preserve the target contract: ${migratedApp}`);
		}
		writeJson(join(repositoryRoot, "plans/evidence/unocss-installed-proof.json"), report);
		console.log(JSON.stringify(report, null, 2));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function createTargetFixture(source: string, target: string): void {
	createFixture(target, true);
	for (const file of ["uno.config.ts", "vite.config.ts", "tsconfig.json", "index.html"]) {
		run("cp", [join(source, file), join(target, file)], repositoryRoot);
	}
	run("cp", ["-R", join(source, "src"), target], repositoryRoot);
}

if (import.meta.main) await main();
