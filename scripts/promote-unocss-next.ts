import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { CodemodAdapterId } from "pandwind-codemod/swap";
import { packageInstalled, run, runCaptured, writeJson } from "./installed-proof.ts";
import { proveNextInstallation, type NextInstalledProof } from "./next-proof.ts";
import { createReferenceWorkspace } from "./reference-workspace.ts";
import { ensureReferenceWorkspace } from "./ensure-reference-workspace.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const referenceWorkspace = createReferenceWorkspace();
const referenceRoot = referenceWorkspace.path("unocss");
const nextExampleRoot = join(referenceRoot, "examples/next");
const unocssCommit = "75103d5e12ec9876069daf6b97a7db1d73428829";
const pandwindPackageRoot = join(repositoryRoot, "packages/pandwind");
const proofSchema = "pandwind.unocss-next-installed-proof/1" as const;

const versions = {
	"@types/node": "26.4.1",
	"@types/react": "19.2.18",
	"@types/react-dom": "19.2.7",
	"@unocss/postcss": "66.10.0",
	next: "16.1.2",
	"oxc-parser": "0.148.0",
	pandwind: `file:${pandwindPackageRoot}`,
	react: "19.2.8",
	"react-dom": "19.2.8",
	typescript: "6.0.3",
	unplugin: "3.3.0",
	unocss: "66.10.0",
} as const;

const tsConfig = {
	compilerOptions: {
		target: "ES2017",
		lib: ["DOM", "DOM.Iterable", "ESNext"],
		allowJs: false,
		skipLibCheck: true,
		strict: true,
		noEmit: true,
		esModuleInterop: true,
		module: "ESNext",
		moduleResolution: "Bundler",
		resolveJsonModule: true,
		isolatedModules: true,
		jsx: "react-jsx",
		plugins: [{ name: "next" }],
	},
	include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
	exclude: ["node_modules"],
};

interface UnoCssNextProof {
	readonly schema: typeof proofSchema;
	readonly reference: {
		readonly repository: "https://github.com/unocss/unocss";
		readonly commit: string;
		readonly sourceEntry: "examples/next/app/page.tsx";
	};
	readonly route: {
		readonly from: CodemodAdapterId.UnoCSS;
		readonly to: CodemodAdapterId.Pandwind;
	};
	readonly fixture: { readonly isolated: true; readonly routeCount: number };
	readonly dependencies: {
		readonly sourceInstalled: boolean;
		readonly targetNodeModule: boolean;
		readonly targetPackage: string;
	};
	readonly migration: {
		readonly converted: number;
		readonly skipped: number;
		readonly residuals: number;
		readonly canonical: {
			readonly checked: boolean;
			readonly equal: boolean;
			readonly differences: readonly string[];
		};
		readonly targetUsesPandwind: boolean;
		readonly sourceUnoIntegrationRemoved: boolean;
		readonly nextWebpackIntegrationPresent: boolean;
	};
	readonly checks: {
		readonly sourceTypecheck: true;
		readonly targetTypecheck: true;
		readonly sourceBuild: true;
		readonly targetBuild: true;
	};
	readonly next: NextInstalledProof;
	readonly css: {
		readonly sourceBytes: number;
		readonly targetBytes: number;
		readonly targetNotLarger: boolean;
	};
}

const packageJson = (includePandwind: boolean): Record<string, unknown> => ({
	private: true,
	type: "module",
	scripts: {
		typecheck: "tsc --noEmit",
		build: "next build --webpack",
		start: "next start",
	},
	dependencies: {
		next: versions.next,
		react: versions.react,
		"react-dom": versions["react-dom"],
		...(includePandwind
			? { pandwind: versions.pandwind, unplugin: versions.unplugin }
			: { "@unocss/postcss": versions["@unocss/postcss"], unocss: versions.unocss }),
	},
	devDependencies: {
		"@types/node": versions["@types/node"],
		"@types/react": versions["@types/react"],
		"@types/react-dom": versions["@types/react-dom"],
		"oxc-parser": versions["oxc-parser"],
		typescript: versions.typescript,
	},
});

const sourceLayout = `import "./globals.css";

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
`;

const sourcePostcss = (pluginPath: string): string => `export default {
	plugins: {
		${JSON.stringify(pluginPath)}: {
			content: ["./app/**/*.{html,js,ts,jsx,tsx}"],
		},
	},
};
`;

const unocssPostcssBridge = `const UnoCSS = require("@unocss/postcss").default;

module.exports = UnoCSS;
`;

const unoConfig = `import { defineConfig } from "unocss";
import { presetWind3 } from "unocss/preset-wind3";

export default defineConfig({ presets: [presetWind3()] });
`;

const targetGlobals = `:root {
	--background: #ffffff;
	--foreground: #171717;
}

@media (prefers-color-scheme: dark) {
	:root {
		--background: #0a0a0a;
		--foreground: #ededed;
	}
}

body {
	background: var(--background);
	color: var(--foreground);
	font-family: Arial, Helvetica, sans-serif;
}
`;

const readReference = (path: string): string => {
	if (!existsSync(path)) throw new Error(`missing UnoCSS reference file: ${path}`);
	return readFileSync(path, "utf8");
};

function writeReferenceFile(path: string, content: string): void {
	writeFileSync(path, content);
}

function createProject(root: string, includePandwind: boolean): void {
	const appRoot = join(root, "app");
	mkdirSync(appRoot, { recursive: true });
	const favicon = join(nextExampleRoot, "app", "favicon.ico");
	if (existsSync(favicon)) cpSync(favicon, join(appRoot, "favicon.ico"));
	writeJson(join(root, "package.json"), packageJson(includePandwind));
	writeJson(join(root, "tsconfig.json"), tsConfig);
	writeReferenceFile(
		join(root, "next-env.d.ts"),
		`/// <reference types="next" />\n/// <reference types="next/image-types/global" />\ndeclare module "*.css";\n`,
	);
	writeReferenceFile(
		join(root, "next.config.mjs"),
		`const nextConfig = { typescript: { ignoreBuildErrors: true } };\n\nexport default nextConfig;\n`,
	);
	writeReferenceFile(
		join(root, "postcss.config.mjs"),
		sourcePostcss(join(root, "unocss-postcss.cjs")),
	);
	writeReferenceFile(join(root, "unocss-postcss.cjs"), unocssPostcssBridge);
	writeReferenceFile(join(root, "uno.config.ts"), unoConfig);
	writeReferenceFile(join(appRoot, "layout.tsx"), sourceLayout);
	writeReferenceFile(
		join(appRoot, "globals.css"),
		readReference(join(nextExampleRoot, "app", "globals.css")),
	);
	const page = readReference(join(nextExampleRoot, "app", "page.tsx"));
	writeReferenceFile(
		join(appRoot, "page.tsx"),
		page.replace(/<main(\s+className=)/u, "<main data-proof$1"),
	);
}

function copyProject(source: string, target: string): void {
	cpSync(source, target, {
		recursive: true,
		filter: (path) =>
			!path.includes(`${sep}node_modules${sep}`) && !path.includes(`${sep}.next${sep}`),
	});
}

function referenceCommit(): string {
	return execFileSync("git", ["-C", referenceRoot, "rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim();
}

function cssBytes(root: string): number {
	const cssRoot = join(root, ".next", "static", "css");
	if (!existsSync(cssRoot)) return 0;
	const visit = (directory: string): number =>
		fsEntries(directory).reduce((total, entry) => {
			return total + (existsSync(entry) && isDirectory(entry) ? visit(entry) : fileSize(entry));
		}, 0);
	return visit(cssRoot);
}

const fsEntries = (directory: string): readonly string[] =>
	readdirSync(directory).map((entry) => join(directory, entry));

const isDirectory = (path: string): boolean => lstatSync(path).isDirectory();

const fileSize = (path: string): number => lstatSync(path).size;

async function main(): Promise<void> {
	await ensureReferenceWorkspace("unocss");
	if (referenceCommit() !== unocssCommit)
		throw new Error(
			`UnoCSS reference is not pinned: expected ${unocssCommit}, got ${referenceCommit()}`,
		);
	if (!existsSync(nextExampleRoot))
		throw new Error(`missing UnoCSS Next example: ${nextExampleRoot}`);
	run("pnpm", ["--filter", "pandwind", "run", "build"], repositoryRoot);
	const root = mkdtempSync(join("/tmp", "pandwind-unocss-next-"));
	const sourceRoot = join(root, "source");
	const targetRoot = join(root, "target");
	const keep = process.argv.includes("--keep");
	try {
		createProject(sourceRoot, false);
		copyProject(sourceRoot, targetRoot);
		run("pnpm", ["install", "--ignore-scripts"], sourceRoot);
		run("pnpm", ["install", "--ignore-scripts"], targetRoot);
		run("pnpm", ["run", "typecheck"], sourceRoot);
		run("pnpm", ["run", "build"], sourceRoot);
		const migration = runCaptured(
			"nub",
			[
				"--conditions",
				"pandwind",
				join(repositoryRoot, "packages/codemod/src/cli.ts"),
				"migrate",
				"--from",
				CodemodAdapterId.UnoCSS,
				"--to",
				CodemodAdapterId.Pandwind,
				"--root",
				targetRoot,
				"--no-install",
				"--report",
				"--report-format=json",
				"app/**/*.tsx",
			],
			repositoryRoot,
		);
		writeReferenceFile(join(targetRoot, "app", "globals.css"), targetGlobals);
		writeJson(join(targetRoot, "package.json"), packageJson(true));
		for (const sourceOnlyFile of ["postcss.config.mjs", "unocss-postcss.cjs", "uno.config.ts"])
			rmSync(join(targetRoot, sourceOnlyFile), { force: true });
		const parsedMigration = JSON.parse(migration.trim()) as {
			files?: readonly {
				converted?: number;
				skipped?: number;
				residuals?: number;
				canonical?: { checked: boolean; equal: boolean; differences: readonly string[] };
			}[];
		};
		const files = parsedMigration.files ?? [];
		const canonical = files.flatMap((file) =>
			file.canonical?.checked === true ? [file.canonical] : [],
		);
		run("pnpm", ["install", "--ignore-scripts"], targetRoot);
		run("pnpm", ["run", "typecheck"], targetRoot);
		run("pnpm", ["run", "build"], targetRoot);
		const next = await proveNextInstallation({
			repositoryRoot,
			sourceRoot,
			targetRoot,
			browserRoutes: ["/"],
			ignoredConsoleErrorPatterns: [
				/^Failed to load resource: the server responded with a status of 404 \(Not Found\)$/u,
			],
		});
		const targetNextConfig = readReference(join(targetRoot, "next.config.mjs"));
		const report: UnoCssNextProof = {
			schema: proofSchema,
			reference: {
				repository: "https://github.com/unocss/unocss",
				commit: unocssCommit,
				sourceEntry: "examples/next/app/page.tsx",
			},
			route: { from: CodemodAdapterId.UnoCSS, to: CodemodAdapterId.Pandwind },
			fixture: { isolated: true, routeCount: next.http.routeCount },
			dependencies: {
				sourceInstalled: packageInstalled(sourceRoot, "unocss"),
				targetNodeModule: packageInstalled(targetRoot, "pandwind"),
				targetPackage: versions.pandwind,
			},
			migration: {
				converted: files.reduce((total, file) => total + (file.converted ?? 0), 0),
				skipped: files.reduce((total, file) => total + (file.skipped ?? 0), 0),
				residuals: files.reduce((total, file) => total + (file.residuals ?? 0), 0),
				canonical: {
					checked: canonical.length > 0 && canonical.every((value) => value.checked),
					equal: canonical.length > 0 && canonical.every((value) => value.equal),
					differences: canonical.flatMap((value) => value.differences),
				},
				targetUsesPandwind: targetNextConfig.includes("pandwind"),
				sourceUnoIntegrationRemoved:
					!existsSync(join(targetRoot, "postcss.config.mjs")) &&
					!existsSync(join(targetRoot, "unocss-postcss.cjs")) &&
					!existsSync(join(targetRoot, "uno.config.ts")) &&
					!packageInstalled(targetRoot, "unocss") &&
					!packageInstalled(targetRoot, "@unocss/postcss"),
				nextWebpackIntegrationPresent: targetNextConfig.includes("pandwindWebpackCss"),
			},
			checks: {
				sourceTypecheck: true,
				targetTypecheck: true,
				sourceBuild: true,
				targetBuild: true,
			},
			next,
			css: {
				sourceBytes: cssBytes(sourceRoot),
				targetBytes: cssBytes(targetRoot),
				targetNotLarger: cssBytes(targetRoot) <= cssBytes(sourceRoot),
			},
		};
		writeJson(join(repositoryRoot, "plans/evidence/unocss-next-installed-proof.json"), report);
		console.log(JSON.stringify(report, null, 2));
		if (
			report.migration.converted === 0 ||
			report.migration.skipped > 0 ||
			report.migration.residuals > 0 ||
			!report.migration.canonical.equal ||
			!report.migration.sourceUnoIntegrationRemoved ||
			!report.migration.nextWebpackIntegrationPresent ||
			!report.next.browser.equivalent ||
			report.next.http.sourceFailures.length > 0 ||
			report.next.http.targetFailures.length > 0 ||
			report.next.rsc.sourceFailures.length > 0 ||
			report.next.rsc.targetFailures.length > 0
		)
			throw new Error("UnoCSS Next proof failed");
	} finally {
		if (keep) console.error(`kept UnoCSS Next proof workspace: ${root}`);
		else rmSync(root, { recursive: true, force: true });
	}
}

if (import.meta.main) await main();
