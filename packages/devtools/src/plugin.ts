/// <reference types="@vitejs/devtools-kit" />
import { globSync, readFileSync } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineRpcFunction } from "@vitejs/devtools-kit";
import type { Plugin, ResolvedConfig } from "vite";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import {
	createMcpProjectContext,
	createMcpToolService,
	MCP_TOOL,
	type McpToolResult,
} from "pandwind-analyze/mcp";
import {
	createDevtoolsEvidenceStore,
	type DevtoolsEvidenceStore,
	type DevtoolsElementInput,
} from "./evidence/store.ts";
import {
	DEVTOOLS_RPC,
	type DevtoolsMigrationInput,
	type DevtoolsMigrationPreview,
} from "./rpc.ts";

export interface PandwindDevtoolsOptions {
	/** Disable the integration while keeping the Vite config branch stable. */
	readonly enabled?: boolean;
	/** Register the host-page element picker action. */
	readonly inspect?: boolean;
}

const fileForId = (id: string): string => id.split("?", 1)[0]!;

const isInspectableFile = (file: string): boolean =>
	!file.includes("/node_modules/") && !file.startsWith("\0") && SOURCE_SCANNER_SERVICE.isScriptFile(file);

function loadInteropTokens(root: string, store: DevtoolsEvidenceStore): void {
	const files = globSync("**/pandwind.interop.json", {
		cwd: root,
		absolute: true,
		ignore: ["**/node_modules/**", "**/.git/**"],
	});
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

function structured<T>(result: McpToolResult): T {
	if (result.isError) throw new Error(result.content[0]?.text ?? "Pandwind DevTools request failed");
	if (result.structuredContent !== undefined) return result.structuredContent as T;
	const text = result.content[0]?.text;
	if (text === undefined) throw new Error("Pandwind DevTools returned an empty response");
	return JSON.parse(text) as T;
}

function recordMigration(
	store: DevtoolsEvidenceStore,
	preview: DevtoolsMigrationPreview,
): void {
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
	const snapshot = store.snapshot();
	const className = input.className?.trim();
	const matchedFiles = snapshot.transforms
		.filter((record) => className === undefined || record.file.includes(className))
		.map((record) => record.file);
	const matchedPrograms = snapshot.stylePrograms
		.filter((record) => className === undefined || record.label?.includes(className) === true)
		.map((record) => record.id);
	store.select({
		...(input.tagName === undefined ? {} : { tagName: input.tagName }),
		...(className === undefined ? {} : { className }),
		attributes: input.attributes ?? {},
		matchedFiles,
		matchedPrograms,
	});
}

export function pandwindDevtools(options: PandwindDevtoolsOptions = {}): Plugin {
	let config: ResolvedConfig | undefined;
	let store: DevtoolsEvidenceStore | undefined;
	let migrationService: ReturnType<typeof createMcpToolService> | undefined;

	const currentStore = (): DevtoolsEvidenceStore => {
		if (store === undefined) throw new Error("Pandwind DevTools evidence is not initialized");
		return store;
	};

	return {
		name: "pandwind-devtools",
		apply: "serve",
		configResolved(resolved) {
			config = resolved;
			store = createDevtoolsEvidenceStore(resolved.root);
			loadInteropTokens(resolved.root, store);
			migrationService = createMcpToolService(createMcpProjectContext(resolved.root));
		},
		transform(code, id) {
			const file = fileForId(id);
			if (!isInspectableFile(file)) return null;
			const started = performance.now();
			const relativeFile = relative(config?.root ?? process.cwd(), file);
			const scan = SOURCE_SCANNER_SERVICE.scan({
				file: relativeFile,
				source: code,
				root: config?.root,
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
				currentStore().recordRuntime({ event: "hmr-update", file: relative(config?.root ?? process.cwd(), file) });
		},
		devtools: {
			setup(ctx) {
				if (options.enabled === false) return;
				const clientPath = fileURLToPath(new URL("../dist/client", import.meta.url));
				ctx.views.hostStatic("/__pandwind_devtools__", clientPath);
				ctx.docks.register({
					id: "pandwind-devtools",
					title: "Pandwind",
					icon: "ph:paint-brush-duotone",
					type: "iframe",
					url: "/__pandwind_devtools__/",
				});
				if (options.inspect !== false)
					ctx.docks.register({
						id: "pandwind-devtools:inspect",
						title: "Inspect styles",
						icon: "ph:cursor-duotone",
						type: "action",
						action: { importFrom: "pandwind-devtools/inspect-action", importName: "default" },
					});
				ctx.rpc.register(
					defineRpcFunction({
						name: DEVTOOLS_RPC.GetSnapshot,
						type: "query",
						setup: () => ({ handler: async () => currentStore().snapshot() }),
					}),
				);
				ctx.rpc.register(
					defineRpcFunction({
						name: DEVTOOLS_RPC.InspectElement,
						type: "action",
						setup: () => ({
							handler: async (input: DevtoolsElementInput) => {
								elementSelection(input, currentStore());
								return currentStore().snapshot();
							},
						}),
					}),
				);
				ctx.rpc.register(
					defineRpcFunction({
						name: DEVTOOLS_RPC.PreviewMigration,
						type: "query",
						setup: () => ({
							handler: async (input: DevtoolsMigrationInput) => {
								if (migrationService === undefined) throw new Error("migration service is not initialized");
								const result = structured<DevtoolsMigrationPreview>(
									await migrationService.call(MCP_TOOL.PreviewMigration, input),
								);
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
