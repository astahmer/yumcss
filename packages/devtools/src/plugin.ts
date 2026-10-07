import { globSync, readFileSync } from "node:fs";
import { basename, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineRpcFunction, type PluginWithDevTools } from "@vitejs/devtools-kit";
import { SOURCE_SCANNER_SERVICE } from "yumcss/source";
import {
	runAdapterMigrationAsync,
	type AdapterCapabilityMode,
	type AdapterMigrationResult,
} from "@yumcss/codemod/swap";
import { unifiedDiff } from "@yumcss/codemod/diff";
import { createBuiltinCodemodCatalog } from "@yumcss/codemod/swap";
import { createSourceWorkspace } from "yumcss/source/workspace";
import { createDevtoolsEvidenceStore, type DevtoolsEvidenceStore } from "./evidence/store.ts";
import {
	DEVTOOLS_RPC,
	type DevtoolsElementInput,
	type DevtoolsMigrationInput,
	type DevtoolsMigrationPreview,
} from "./rpc.ts";

export interface YumCSSDevtoolsOptions {
	/** Disable the integration while keeping the Vite config branch stable. */
	readonly enabled?: boolean;
	/** Register the host-page element picker action. */
	readonly inspect?: boolean;
}

const fileForId = (id: string): string => id.split("?", 1)[0]!;

const isInspectableFile = (file: string): boolean =>
	!file.includes("/node_modules/") &&
	!file.startsWith("\0") &&
	SOURCE_SCANNER_SERVICE.isScriptFile(file);

function loadInteropTokens(root: string, store: DevtoolsEvidenceStore): void {
	const files = globSync("**/yumcss.interop.json", {
		cwd: root,
	})
		.filter((file) => !file.includes("node_modules/") && !file.includes(".git/"))
		.map((file) => resolve(root, file));
	for (const file of files) {
		try {
			const value: unknown = JSON.parse(readFileSync(file, "utf8"));
			if (typeof value !== "object" || value === null) continue;
			const theme = (value as { theme?: unknown }).theme;
			if (typeof theme !== "object" || theme === null) continue;
			const variables = (theme as { variables?: unknown }).variables;
			if (typeof variables !== "object" || variables === null) continue;
			for (const [name, tokenValue] of Object.entries(variables)) {
				if (typeof tokenValue !== "string" && typeof tokenValue !== "number") continue;
				store.recordToken({
					name,
					value: tokenValue,
					kind: "raw",
					theme: basename(file, extname(file)),
					files: [relative(root, file)],
				});
			}
		} catch {
			// A partially written generated artifact is not a dev-server failure.
		}
	}
}

const migrationMode = (value: DevtoolsMigrationInput["mode"]): AdapterCapabilityMode =>
	value === "partial" ? "partial" : "safe";

const projectPath = (root: string, candidate: string): string => {
	const normalized = candidate.replaceAll("\\", "/");
	if (
		normalized.startsWith("/") ||
		/^[A-Za-z]:\//u.test(normalized) ||
		normalized.split("/").includes("..")
	)
		throw new Error(`migration path must be project-relative: ${candidate}`);
	const absolute = resolve(root, normalized);
	const outside = relative(root, absolute);
	if (outside === ".." || outside.startsWith(`..${sep}`))
		throw new Error(`migration path escapes project root: ${candidate}`);
	return absolute;
};

const packageJsonFor = (root: string): Readonly<Record<string, unknown>> | undefined => {
	try {
		const value: unknown = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
		return typeof value === "object" && value !== null
			? (value as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
};

const serializeMigration = (file: string, result: AdapterMigrationResult, before: string) => ({
	file,
	changed: result.changed,
	code: result.code,
	diff: unifiedDiff(before, result.code, file),
	converted: result.converted,
	skipped: result.skipped,
	residuals: result.residuals,
	loweringPlans: result.loweringPlans,
	generatedFiles: result.generatedFiles,
});

async function previewMigration(
	root: string,
	input: DevtoolsMigrationInput,
): Promise<DevtoolsMigrationPreview> {
	if (input.files.length === 0 || input.from.length === 0 || input.to.length === 0)
		throw new Error("migration requires files, from, and to");
	const workspace = createSourceWorkspace();
	const expanded = new Set<string>();
	for (const pattern of input.files) {
		projectPath(root, pattern);
		for (const file of workspace.files([pattern], root, { includeUnsupported: true }))
			expanded.add(file);
	}
	if (expanded.size === 0) throw new Error("migration files did not match any project files");
	const allFiles = workspace.files(["**/*"], root, { includeUnsupported: true });
	const packageJson = packageJsonFor(root);
	const files = [];
	for (const absolute of [...expanded].toSorted()) {
		const file = relative(root, absolute).split(sep).join("/");
		const before = readFileSync(absolute, "utf8");
		const result = await runAdapterMigrationAsync(before, {
			from: input.from,
			to: input.to,
			file,
			root,
			packageJson,
			readFile: (candidate) => {
				try {
					const absoluteCandidate = projectPath(root, candidate);
					return readFileSync(absoluteCandidate, "utf8");
				} catch {
					return undefined;
				}
			},
			listFiles: () => allFiles,
			mode: migrationMode(input.mode),
		});
		files.push(serializeMigration(file, result, before));
	}
	return {
		schema: "yumcss.devtools.migration-preview/1",
		root,
		from: input.from,
		to: input.to,
		mode: migrationMode(input.mode),
		files,
	};
}

function recordMigration(store: DevtoolsEvidenceStore, preview: DevtoolsMigrationPreview): void {
	for (const file of preview.files) {
		store.recordMigration({
			id: `${preview.from}->${preview.to}:${file.file}`,
			from: preview.from,
			to: preview.to,
			files: [file.file],
			changed: file.changed ? 1 : 0,
			residuals: file.residuals.length,
		});
		for (const [index, plan] of file.loweringPlans.entries()) {
			store.recordStyleProgram({
				id: `${preview.from}->${preview.to}:${file.file}:${index}`,
				file: file.file,
				label: `${preview.from} → ${preview.to}`,
				program: plan.program,
			});
		}
	}
}

function elementSelection(input: DevtoolsElementInput, store: DevtoolsEvidenceStore): void {
	const className = input.className?.trim();
	const classNames = input.classNames ?? [];
	const matchedPrograms = store
		.snapshot()
		.stylePrograms.filter(
			(record) => record.label !== undefined && classNames.includes(record.label),
		)
		.map((record) => record.id);
	store.select({
		...(input.tagName === undefined ? {} : { tagName: input.tagName }),
		...(className === undefined ? {} : { className }),
		classNames,
		attributes: input.attributes ?? {},
		computedStyles: input.computedStyles ?? {},
		classRules: input.classRules ?? [],
		matchedPrograms,
	});
}

export function yumcssDevtools(options: YumCSSDevtoolsOptions = {}): PluginWithDevTools {
	let root: string | undefined;
	let store: DevtoolsEvidenceStore | undefined;

	const currentStore = (): DevtoolsEvidenceStore => {
		if (store === undefined) throw new Error("YumCSS DevTools evidence is not initialized");
		return store;
	};

	return {
		name: "yumcss-devtools",
		apply: "serve",
		configResolved(resolved) {
			root = resolved.root;
			store = createDevtoolsEvidenceStore(resolved.root);
			loadInteropTokens(resolved.root, store);
		},
		transform(code, id) {
			const file = fileForId(id);
			if (!isInspectableFile(file)) return null;
			const started = performance.now();
			const relativeFile = relative(root ?? process.cwd(), file);
			const scan = SOURCE_SCANNER_SERVICE.scan({
				file: relativeFile,
				source: code,
				root,
			});
			const evidence = currentStore();
			evidence.recordTransform(relativeFile, Buffer.byteLength(code), performance.now() - started);
			evidence.recordScan({
				file: relativeFile,
				language: scan.language,
				...(scan.framework === undefined ? {} : { framework: scan.framework }),
				diagnosticCount: scan.diagnostics.length,
				excludedRangeCount: scan.excluded.length,
			});
			for (const [index, diagnostic] of scan.diagnostics.entries())
				evidence.recordDiagnostic({
					id: `scan:${relativeFile}:${index}`,
					severity: "warning",
					message: diagnostic.message,
					file: relativeFile,
					source: "source-scanner",
				});
			return null;
		},
		handleHotUpdate({ file }) {
			if (isInspectableFile(file))
				currentStore().recordRuntime({
					event: "hmr-update",
					file: relative(root ?? process.cwd(), file),
				});
		},
		devtools: {
			setup(ctx) {
				if (options.enabled === false) return;
				const clientPath = fileURLToPath(new URL("../dist/client", import.meta.url));
				const modulePath = fileURLToPath(new URL("../dist", import.meta.url));
				ctx.views.hostStatic("/__yumcss_devtools__", clientPath);
				ctx.views.hostStatic("/__yumcss_devtools_modules__", modulePath);
				ctx.docks.register({
					id: "yumcss-devtools",
					title: "YumCSS",
					icon: "ph:paint-brush-duotone",
					type: "iframe",
					url: "/__yumcss_devtools__/",
				});
				if (options.inspect !== false)
					ctx.docks.register({
						id: "yumcss-devtools:inspect",
						title: "Inspect styles",
						icon: "ph:cursor-duotone",
						type: "action",
						action: {
							importFrom: "/__yumcss_devtools_modules__/client/inspect-action.js",
							importName: "default",
						},
					});
				const registerRpc = (definition: unknown): void => {
					// @vitejs/devtools-kit types the definition for its Vite context,
					// while the underlying hub register method accepts the narrower
					// devframe context. The runtime contract is the same; bridge the
					// contravariant context type at this single integration boundary.
					ctx.rpc.register(definition as Parameters<typeof ctx.rpc.register>[0]);
				};
				registerRpc(
					defineRpcFunction({
						name: DEVTOOLS_RPC.GetSnapshot,
						type: "query",
						args: undefined,
						returns: undefined,
						setup: () => ({ handler: async () => currentStore().snapshot() }),
					}),
				);
				registerRpc(
					defineRpcFunction({
						name: DEVTOOLS_RPC.GetCatalog,
						type: "query",
						args: undefined,
						returns: undefined,
						setup: () => ({
							handler: async () =>
								createBuiltinCodemodCatalog().adapters.map((adapter) => ({
									id: adapter.id,
									officialApi: adapter.officialApi,
								})),
						}),
					}),
				);
				registerRpc(
					defineRpcFunction({
						name: DEVTOOLS_RPC.InspectElement,
						type: "action",
						args: undefined,
						returns: undefined,
						setup: () => ({
							handler: async (input: DevtoolsElementInput) => {
								elementSelection(input, currentStore());
								return currentStore().snapshot();
							},
						}),
					}),
				);
				registerRpc(
					defineRpcFunction({
						name: DEVTOOLS_RPC.PreviewMigration,
						type: "query",
						args: undefined,
						returns: undefined,
						setup: () => ({
							handler: async (input: DevtoolsMigrationInput) => {
								const projectRoot = root;
								if (projectRoot === undefined) throw new Error("Vite root is not initialized");
								const result = await previewMigration(projectRoot, input);
								recordMigration(currentStore(), result);
								return result;
							},
						}),
					}),
				);
			},
		},
	};
}
