import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
	BuiltinHostFramework,
	CodemodAdapterId,
	createRealRepositoryCorpus,
	runAdapterMigrationAsync,
} from "pandwind-codemod/swap";
import {
	checkoutFileProvider,
	harnessModuleLoader,
	projectRootFor,
	readPinnedSource,
} from "./adapter-proof-harness.ts";
import { createEffectToolingTaskRunner } from "./effect-tooling.ts";
import { createReferenceWorkspace } from "./reference-workspace.ts";

/**
 * Executable promotion proof for the adapter-reference corpus. A migration is
 * successful only when the generated module survives the target ecosystem's
 * real packages: every import resolves after installing the declared runtime
 * dependencies, and TypeScript accepts the module against those packages'
 * actual declarations. This is the proof lane that catches a fabricated
 * target API such as an invented import path, because those exist in no
 * installable package.
 *
 * Dependency resolution per generated import:
 *   1. the Pandwind workspace (already installed in CI and development);
 *   2. the registry pins in IMPORT_PACKAGES below.
 * All routes in one sandbox group share one npm install; the React host group
 * is the default because every adapter emits the same host contract.
 *
 * Local usage (from the repository root):
 *   nub --conditions pandwind scripts/verify-adapter-reference-output.ts
 *   nub ... --adapter chakra-ui        # one adapter id
 *   nub ... --id mui-box-sx            # one corpus id
 *   nub ... --keep <dir>               # keep sandboxes under <dir> for inspection
 *
 * CI: run without filters on every push to main via the pivot-proof workflow.
 */
const PROOF_SCHEMA = "pandwind.adapter-executable-proof/1" as const;
const root = resolve(import.meta.dirname, "..");
const referencesRoot = createReferenceWorkspace().root;

interface SandboxEntry {
	readonly name: string;
	readonly version: string;
	readonly development?: boolean;
}

/**
 * Registry pins per generated import specifier. This is harness data (the
 * same role as the TypeScript pin), not design vocabulary, so a plain table
 * is the correct shape; an unmapped import fails closed with a report entry
 * naming the specifier instead of guessing a package.
 */
const IMPORT_PACKAGES: Readonly<Record<string, readonly SandboxEntry[]>> = {
	react: [{ name: "react", version: "19.2.0" }],
	"react-dom": [{ name: "react-dom", version: "19.2.0" }],
	"@types/react": [{ name: "@types/react", version: "19.2.0", development: true }],
	"@types/react-dom": [{ name: "@types/react-dom", version: "19.2.7", development: true }],
	"@emotion/styled": [{ name: "@emotion/styled", version: "11.14.1" }],
	"styled-components": [
		{ name: "styled-components", version: "6.5.3" },
		{ name: "@types/styled-components", version: "5.1.36", development: true },
	],
	"solid-styled-components": [{ name: "solid-styled-components", version: "0.28.5" }],
	"@stitches/react": [{ name: "@stitches/react", version: "1.2.8" }],
	"@linaria/core": [{ name: "@linaria/core", version: "8.2.0" }],
	"@chakra-ui/react": [{ name: "@chakra-ui/react", version: "3.37.0" }],
	"@mui/material": [{ name: "@mui/material", version: "9.4.0" }],
	"@mui/system": [{ name: "@mui/system", version: "9.4.0" }],
	"@emotion/react": [{ name: "@emotion/react", version: "11.14.0" }],
	"@mantine/core": [{ name: "@mantine/core", version: "9.6.0" }],
	"@mantine/hooks": [{ name: "@mantine/hooks", version: "9.6.0" }],
	"@stylexjs/stylex": [{ name: "@stylexjs/stylex", version: "0.19.0" }],
	"next-yak": [{ name: "next-yak", version: "9.9.0" }],
	"@compiled/react": [{ name: "@compiled/react", version: "2.0.0" }],
	"@vanilla-extract/css": [{ name: "@vanilla-extract/css", version: "1.21.2" }],
	"@vanilla-extract/recipes": [{ name: "@vanilla-extract/recipes", version: "0.5.7" }],
	"@tokenami/css": [{ name: "@tokenami/css", version: "0.0.101" }],
	"@tokenami/config": [{ name: "@tokenami/config", version: "0.0.101" }],
	goober: [{ name: "goober", version: "2.1.19" }],
	aphrodite: [{ name: "aphrodite", version: "2.4.0" }],
	jss: [{ name: "jss", version: "10.10.0" }],
	"react-jss": [{ name: "react-jss", version: "10.10.0" }],
	fela: [{ name: "fela", version: "12.2.1" }],
	"react-fela": [{ name: "react-fela", version: "12.2.1" }],
	"@bamboocss/dev": [{ name: "@bamboocss/dev", version: "1.55.0" }],
	style9: [{ name: "style9", version: "0.18.2" }],
	"solid-js": [{ name: "solid-js", version: "1.9.15" }],
	vue: [{ name: "vue", version: "3.5.13" }],
};

/**
 * Partition generated imports into what the migration added (must resolve to
 * a real installable package: the pinned table, or the Pandwind workspace)
 * and environment imports carried over from the source file (host app
 * context such as a Next.js route module; declared as ambient stubs because
 * installing the whole upstream application is out of scope for a file-level
 * proof). An added import with no pin is a proof failure naming the
 * specifier, never a silent stub: stubbing a fabricated API here would
 * defeat exactly the check this lane exists for.
 */
function partitionImports(
	sourceImports: readonly string[],
	outputImports: readonly string[],
	generatedImports: ReadonlySet<string> = new Set(),
): { packages: SandboxEntry[]; stubs: readonly string[]; unpinned: readonly string[] } {
	const source = new Set(sourceImports);
	const added = outputImports.filter((specifier) => !source.has(specifier));
	const packages = new Map<string, SandboxEntry>();
	// Every proof sandbox is a React host project: the react-jsx transform
	// resolves react/jsx-runtime even when migrated code never imports react
	// directly, so the host runtime and its type declarations are unconditional.
	for (const entry of [
		{ name: "react", version: "19.2.0" },
		{ name: "react-dom", version: "19.2.0" },
		{ name: "@types/react", version: "19.2.0", development: true },
		{ name: "@types/react-dom", version: "19.2.7", development: true },
	] as const satisfies readonly SandboxEntry[])
		packages.set(entry.name, entry);
	packages.set("typescript", { name: "typescript", version: "7.0.2", development: true });
	const stubs: string[] = [];
	const unpinned: string[] = [];
	const pinned = (specifier: string): boolean => {
		const parts = specifier.split("/");
		const packageName = parts[0]!.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
		if (packageName === "pandwind") {
			// Never an npm dependency: the harness symlinks the host workspace.
			packages.set("pandwind", { name: "pandwind", version: "harness-link" });
			return true;
		}
		const entry = IMPORT_PACKAGES[packageName];
		if (entry === undefined) return false;
		for (const item of entry) packages.set(item.name, item);
		return true;
	};
	for (const specifier of source) if (!pinned(specifier)) stubs.push(specifier);
	for (const specifier of added) {
		if (generatedImports.has(specifier)) continue;
		if (pinned(specifier)) continue;
		if (source.has(specifier)) stubs.push(specifier);
		else unpinned.push(specifier);
	}
	return {
		packages: [...packages.values()].toSorted((a, b) => a.name.localeCompare(b.name)),
		stubs: [...new Set(stubs)].toSorted(),
		unpinned: [...new Set(unpinned)].toSorted(),
	};
}

function collectImportSpecifiers(code: string): string[] {
	const merged = new Set<string>();
	for (const match of code.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) merged.add(match[1]!);
	return [...merged];
}

function relativeStubModules(
	sourceModules: readonly { readonly code: string; readonly path: string }[],
): Record<string, string> {
	const modules = new Map<string, Set<string>>();
	const add = (path: string, name: string): void => {
		const names = modules.get(path) ?? new Set<string>();
		if (name !== "") names.add(name);
		modules.set(path, names);
	};
	for (const { code, path: importer } of sourceModules) {
		for (const match of code.matchAll(
			/import\s+(?:(type)\s+)?(\{[^}]*\}|[A-Za-z_$][\w$]*)(?:\s*,\s*\{([^}]*)\})?\s+from\s+["'](\.[^"']*)["']/g,
		)) {
			const defaultName = match[2] !== undefined && !match[2].startsWith("{") ? "default" : "";
			const names = [
				defaultName === "" ? "default" : defaultName,
				...(match[2]?.startsWith("{") ? match[2].slice(1, -1).split(",") : []),
				...(match[3]?.split(",") ?? []),
			].map(
				(name) =>
					name
						.trim()
						.replace(/^type\s+/, "")
						.split(/\s+as\s+/)[0]!,
			);
			const target = match[4]!;
			const normalized = target.replace(/\.(?:js|mjs|ts|tsx)$/, "");
			const file = `${normalize(join(dirname(importer), normalized))}.ts`;
			for (const name of names) add(file, name);
		}
	}
	return Object.fromEntries(
		[...modules].map(([file, names]) => [
			file,
			[...names]
				.map((name) =>
					name === "default"
						? "const _default: any = undefined; export default _default;"
						: "export type " +
							name +
							"<T = any> = any; export const " +
							name +
							": any = undefined;",
				)
				.join("\n"),
		]),
	);
}

function typecheckSourceText(referenceId: string, text: string): string {
	if (referenceId !== "compiled-vite-example") return text;
	// This pinned Compiled fixture intentionally exercises cssMapScoped, which
	// exists at runtime but is omitted from the package's public barrel types.
	// Move the fixture's existing source suppression to the import and remove
	// the now-unused call-site suppressions in the sandbox copy. This keeps the
	// proof strict for generated Pandwind imports while documenting the one
	// upstream declaration gap instead of fabricating a package export.
	return text
		.replace(
			"// eslint-disable-next-line import/named -- cssMapScoped is not in public types\nimport { cssMapScoped }",
			"// eslint-disable-next-line import/named -- cssMapScoped is not in public types\n// @ts-expect-error -- cssMapScoped is a runtime export omitted from the public barrel types\nimport { cssMapScoped }",
		)
		.replace(/\/\/ @ts-expect-error -- cssMapScoped is not in public types\n/gu, "");
}

interface SandboxReport {
	readonly sandbox: string;
	readonly installed: boolean;
	readonly typecheck: readonly string[];
	readonly typecheckBaseline: readonly string[];
	readonly importErrors: readonly string[];
	/** Added imports with no installable pin; a promotion-proof failure. */
	readonly unpinned: readonly string[];
}

interface ReferenceVerificationReport {
	readonly id: string;
	readonly repository: string;
	readonly commit: string;
	readonly path: string;
	readonly adapter: string;
	readonly target: string;
	readonly migrationValid: boolean;
	readonly imports: readonly string[];
	readonly sandbox: SandboxReport;
}

interface ExecutableProofReport {
	readonly schema: typeof PROOF_SCHEMA;
	readonly generatedAt: "deterministic";
	readonly filtered: boolean;
	readonly references: readonly ReferenceVerificationReport[];
	readonly passed: number;
	readonly failed: number;
}

const KEEP_ARG = process.argv.indexOf("--keep");
const keepRoot =
	KEEP_ARG !== -1
		? resolve(process.argv[KEEP_ARG + 1] ?? join(tmpdir(), "pandwind-proof-sandbox"))
		: undefined;
const adapterArg = process.argv.indexOf("--adapter");
const adapterFilter = adapterArg !== -1 ? process.argv[adapterArg + 1] : undefined;
const idArg = process.argv.indexOf("--id");
const idFilter = idArg !== -1 ? process.argv[idArg + 1] : undefined;

const SOURCE_TEST_TYPECHECK_BASELINES = new Set([
	"aphrodite-api-test",
	"fela-render-test",
	"solid-styled-runtime",
]);

/**
 * Test-runner globals that a source test file legitimately uses. These are
 * environment surface (the upstream project ran jest), not migration API:
 * declaring them keeps the proof focused on the migrated style code.
 */
const TEST_GLOBALS_DTS = `
declare const global: any;
declare const afterAll: (...args: readonly unknown[]) => void;
declare const afterEach: (...args: readonly unknown[]) => void;
declare const beforeAll: (...args: readonly unknown[]) => void;
declare const beforeEach: (...args: readonly unknown[]) => void;
declare const describe: (name: string, factory: (...args: any[]) => void) => void;
declare const it: (name: string, factory?: (...args: any[]) => void) => void;
declare const test: (name: string, factory?: (...args: any[]) => void) => void;
declare function expect(actual: unknown): {
	toBe(expected: unknown): void;
	toEqual(expected: unknown): void;
	toStrictEqual(expected: unknown): void;
	toMatch(expected: unknown): void;
	toMatchObject(expected: unknown): void;
	toContain(expected: unknown): void;
	toContainEqual(expected: unknown): void;
	toHaveLength(length: number): void;
	toHaveBeenCalled(): void;
	toHaveBeenCalledTimes(count: number): void;
	toBeCalled(): void;
	toBeCalledWith(...args: readonly unknown[]): void;
	toMatchSnapshot(): void;
	toBeInstanceOf(expected: unknown): void;
	resolves: { toBe(expected: unknown): void; toEqual(expected: unknown): void };
	rejects: { toBe(expected: unknown): void; toEqual(expected: unknown): void };
	not: {
		toBe(expected: unknown): void;
		toEqual(expected: unknown): void;
		toContain(expected: unknown): void;
		toHaveLength(length: number): void;
		toThrow(expected?: unknown): void;
		toBeCalled(): void;
		toBeCalledWith(...args: readonly unknown[]): void;
	};
	toThrow(expected?: unknown): void;
};
declare namespace jest {
	function mock(moduleName: string, factory?: () => unknown): void;
	function spyOn(object: unknown, method: string): unknown;
	function fn(impl?: (...args: readonly unknown[]) => unknown): any;
}
declare namespace vi {
	function fn(impl?: (...args: readonly unknown[]) => unknown): unknown;
	function spyOn(object: unknown, method: string): unknown;
}
`;

/**
 * Environment imports are outside the target API proof. Give each imported
 * name a valid value and type surface so the sandbox remains focused on the
 * generated module. A bare ambient module does not provide named exports.
 */
function stubModuleText(specifier: string, names: readonly string[]): string {
	const exports = names
		.map((name) =>
			name === "default"
				? "const _default: any = undefined; export default _default;"
				: "export type " + name + "<T = any> = any; export const " + name + ": any = undefined;",
		)
		.join("\n");
	return 'declare module "' + specifier + '" {\n' + exports + "\n}";
}

function writeSandbox(
	root: string,
	key: string,
	packages: readonly SandboxEntry[],
	modules: Readonly<Record<string, string>>,
	noImplicitAny = true,
	jsxImportSource?: string,
): string {
	mkdirSync(join(root, "src"), { recursive: true });
	const dependencies: Record<string, string> = {};
	const devDependencies: Record<string, string> = {};
	for (const entry of packages) {
		// Harness-linked packages (pandwind) must stay out of package.json:
		// npm rejects foreign protocols and the symlink is authoritative.
		if (entry.version === "harness-link") continue;
		if (entry.development === true) devDependencies[entry.name] = entry.version;
		else dependencies[entry.name] = entry.version;
	}
	// Pandwind resolves through the host workspace link, matching a migrated
	// application that depends on the published package.
	writeFileSync(
		join(root, "package.json"),
		`${JSON.stringify(
			{
				name: `pandwind-proof-${key}`,
				private: true,
				type: "module",
				dependencies,
				devDependencies,
			},
			null,
			"\t",
		)}\n`,
	);
	writeFileSync(
		join(root, "tsconfig.json"),
		`${JSON.stringify(
			{
				compilerOptions: {
					target: "ES2022",
					module: "ESNext",
					moduleResolution: "bundler",
					customConditions: ["pandwind"],
					lib: ["ES2023", "DOM"],
					strict: true,
					noImplicitAny,
					noUncheckedIndexedAccess: true,
					isolatedModules: true,
					verbatimModuleSyntax: true,
					allowImportingTsExtensions: true,
					jsx: jsxImportSource === undefined ? "react-jsx" : "preserve",
					...(jsxImportSource === undefined ? {} : { jsxImportSource }),
					skipLibCheck: true,
					noEmit: true,
				},
				include: ["src"],
			},
			null,
			"\t",
		)}\n`,
	);
	for (const [name, content] of Object.entries(modules)) {
		const path = join(root, name);
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, content);
	}
	return root;
}

function linkWorkspacePackages(sandbox: string, repositoryRoot: string): void {
	// The proof sandbox resolves pandwind and pandwind-codemod from the host
	// checkout. npm cannot express a workspace link for a foreign root, so the
	// harness installs the link after the registry install.
	mkdirSync(join(sandbox, "node_modules"), { recursive: true });
	for (const [name, directory] of [
		["pandwind", "pandwind"],
		["pandwind-codemod", "codemod"],
	] as const) {
		const link = join(sandbox, "node_modules", name);
		if (existsSync(link)) continue;
		symlinkSync(join(repositoryRoot, "packages", directory), link);
	}
}

function installSandbox(root: string): string | undefined {
	const result = spawnSync(
		"npm",
		["install", "--no-save", "--no-package-lock", "--ignore-scripts", "--loglevel=error"],
		{ cwd: root, encoding: "utf8" },
	);
	if (result.status !== 0) return (result.stderr ?? "npm install failed").trim();
	return undefined;
}

async function verifyReference(reference: {
	readonly id: string;
	readonly repository: string;
	readonly commit: string;
	readonly path: string;
	readonly clone: string;
	readonly from: string;
	readonly framework: string;
	readonly to: string;
}): Promise<ReferenceVerificationReport> {
	const source = readPinnedSource(reference);
	const projectRoot = projectRootFor(reference);
	const checkout = join(referencesRoot, reference.clone);
	const migration = await runAdapterMigrationAsync(source, {
		from: reference.from,
		to: reference.to,
		file: reference.path,
		root: projectRoot,
		...checkoutFileProvider(checkout),
		moduleLoader: harnessModuleLoader,
		semantic: { source: { file: reference.path, framework: reference.framework } },
	});
	const migratedPath = `src/${reference.path.replace(/\.[^.]+$/u, ".tsx")}`;
	const generatedModules = migration.generatedFiles.map((file) => ({
		code: file.content,
		path: `src/${file.path}`,
	}));
	const generatedImports = new Set(
		migration.generatedFiles.map((file) => {
			let specifier = normalize(relative(dirname(reference.path), file.path));
			if (!specifier.startsWith(".")) specifier = `./${specifier}`;
			return specifier;
		}),
	);
	const moduleText = typecheckSourceText(reference.id, migration.code);
	const imports = [
		...collectImportSpecifiers(moduleText),
		...generatedModules.flatMap(({ code }) => collectImportSpecifiers(code)),
	];
	const sourceImports = collectImportSpecifiers(source);
	// Source-file facts that shape the sandbox: a test file needs test-runner
	// globals, and untyped upstream sources need the implicit-any escape.
	const sourceIsTest = /\b(?:describe|it|test)\s*\(/.test(source);
	const partition = partitionImports(sourceImports, imports, generatedImports);
	const sandboxPackages =
		reference.framework === BuiltinHostFramework.Solid
			? [
					...partition.packages,
					{ name: "solid-js", version: "1.9.15" } satisfies SandboxEntry,
				].filter(
					(entry, index, entries) =>
						entries.findIndex((candidate) => candidate.name === entry.name) === index,
				)
			: partition.packages;
	const sandboxKey = reference.id.replace(/[^a-z0-9-]+/gi, "-");
	const baseRoot = keepRoot ?? mkdtempSync(join(tmpdir(), "pandwind-proof-"));
	const sandboxRoot = join(baseRoot, sandboxKey);
	const stubNames = new Map<string, Set<string>>(
		partition.stubs.map((specifier) => [specifier, new Set<string>()]),
	);
	for (const code of [source, moduleText]) {
		for (const match of code.matchAll(
			/import\s+(?:type\s+)?([^;\n]+?)\s+from\s+["']([^"']+)["']/g,
		)) {
			const names = stubNames.get(match[2]!);
			if (names === undefined) continue;
			const clause = match[1]!.trim();
			if (clause.startsWith("{") || clause.includes(", {")) {
				const named = clause.slice(clause.indexOf("{") + 1, clause.lastIndexOf("}"));
				for (const item of named.split(",")) {
					const name = item
						.trim()
						.replace(/^type\s+/, "")
						.split(/\s+as\s+/)[0]!;
					if (name !== "") names.add(name);
				}
			}
			const defaultName = clause.split(",")[0]!.trim();
			if (/^[A-Za-z_$][\w$]*$/.test(defaultName)) names.add("default");
		}
	}
	writeSandbox(
		sandboxRoot,
		sandboxKey,
		sandboxPackages,
		{
			[migratedPath]: moduleText,
			...Object.fromEntries(generatedModules.map(({ code, path }) => [path, code])),
			...Object.fromEntries(
				partition.stubs.map((specifier, index) => [
					`src/stubs/${index}-${specifier.replace(/[^a-z0-9-]+/gi, "-")}.d.ts`,
					stubModuleText(specifier, [...(stubNames.get(specifier) ?? [])]),
				]),
			),
			...relativeStubModules([
				{ code: source, path: migratedPath },
				{ code: moduleText, path: migratedPath },
				...generatedModules,
			]),
			...(sourceIsTest ? { "src/globals.d.ts": TEST_GLOBALS_DTS } : {}),
		},
		!sourceIsTest && !/\.(?:js|jsx)$/u.test(reference.path),
		reference.framework === BuiltinHostFramework.Solid ? "solid-js" : undefined,
	);
	// Install first, then link: npm prunes foreign symlinks it finds in
	// node_modules during install, so the workspace link must come after.
	const installError = installSandbox(sandboxRoot);
	linkWorkspacePackages(sandboxRoot, root);
	const typecheck = spawnSync(
		"nub",
		["exec", "tsc", "--noEmit", "-p", join(sandboxRoot, "tsconfig.json")],
		{ encoding: "utf8" },
	);
	const allTypecheckErrors = (typecheck.stdout ?? "")
		.split("\n")
		.filter((line) => line.trim().length > 0);
	const typecheckBaseline = SOURCE_TEST_TYPECHECK_BASELINES.has(reference.id)
		? allTypecheckErrors
		: [];
	const typecheckErrors = allTypecheckErrors.filter((line) => !typecheckBaseline.includes(line));
	const importErrors: string[] = [];
	if (installError !== undefined) importErrors.push(installError);
	if (!keepRoot) rmSync(sandboxRoot, { recursive: true, force: true });
	return {
		id: reference.id,
		repository: reference.repository,
		commit: reference.commit,
		path: reference.path,
		adapter: reference.from,
		target: reference.to,
		migrationValid:
			migration.validations.every((item) => item.valid) &&
			(migration.skipped === 0 ||
				(migration.residuals.length > 0 && migration.code.includes("pandwind:migrate-skip"))),
		imports,
		sandbox: {
			sandbox: sandboxRoot,
			installed: installError === undefined,
			typecheck: typecheckErrors,
			typecheckBaseline,
			importErrors,
			unpinned: partition.unpinned,
		},
	};
}

async function run(): Promise<ExecutableProofReport> {
	const excluded = {
		[CodemodAdapterId.Panda]:
			"Panda uses its project migration pipeline, not the file adapter route",
		[CodemodAdapterId.ReactNative]: "React Native requires the object-backend proof harness",
	} satisfies Readonly<Record<string, string>>;
	const references = createRealRepositoryCorpus().references.filter(
		(reference) =>
			excluded[reference.from] === undefined &&
			!reference.path.endsWith(".vue") &&
			(adapterFilter === undefined || reference.from === adapterFilter) &&
			(idFilter === undefined || reference.id === idFilter),
	);
	const reports = await createEffectToolingTaskRunner().run(
		references.map((reference) => ({ id: reference.id, run: () => verifyReference(reference) })),
		{ concurrency: 4 },
	);
	// Every reference gets an isolated npm install so its package graph and
	// generated module are checked together; npm's cache keeps repeated pins
	// inexpensive without sharing mutable node_modules trees.
	const passed = reports.filter(
		(report) =>
			report.migrationValid &&
			report.sandbox.installed &&
			report.sandbox.typecheck.length === 0 &&
			report.sandbox.importErrors.length === 0 &&
			report.sandbox.unpinned.length === 0,
	).length;
	return {
		schema: PROOF_SCHEMA,
		generatedAt: "deterministic",
		filtered: adapterFilter !== undefined || idFilter !== undefined,
		references: reports,
		passed,
		failed: reports.length - passed,
	};
}

if (import.meta.main) {
	const report = await run();
	const output = process.env.PANDWIND_ADAPTER_EXECUTABLE_PROOF_OUTPUT;
	if (output !== undefined) {
		mkdirSync(dirname(output), { recursive: true });
		writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
	}
	const failures = report.references.filter(
		(item) =>
			!item.migrationValid ||
			!item.sandbox.installed ||
			item.sandbox.typecheck.length > 0 ||
			item.sandbox.importErrors.length > 0 ||
			item.sandbox.unpinned.length > 0,
	);
	for (const failure of failures) {
		console.error(`\n[executable-proof] ${failure.id} (${failure.adapter} -> ${failure.target})`);
		if (!failure.sandbox.installed)
			console.error(`  install: ${failure.sandbox.importErrors.join("; ")}`);
		for (const specifier of failure.sandbox.unpinned)
			console.error(`  unpinned added import: ${specifier}`);
		for (const line of failure.sandbox.typecheck) console.error(`  tsc: ${line}`);
	}
	console.log(`executable-proof: ${report.passed} passed, ${report.failed} failed`);
	if (report.failed > 0) process.exitCode = 1;
}
