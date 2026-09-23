import { readFileSync } from "node:fs";
import { relative } from "node:path";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigrationAsync,
	SwapSourceId,
	type StyleAdapter,
} from "pandwind-codemod/swap";
import { PANDWIND_API_DIALECTS } from "pandwind-codemod/swap/browser";
import { createSourceWorkspace } from "pandwind/source/workspace";
import { parseThemeScopes, parseThemeVars } from "../collect/parsers.ts";
import { crawlCssImports } from "../collect/theme-crawl.ts";
import { MIGRATION_PREVIEW_EVIDENCE_CHECK, MIGRATION_PREVIEW_EXECUTION_LANE } from "./contracts.ts";
import type {
	MigrationPreviewDiagnostic,
	MigrationPreviewAdapterCatalogPort,
	MigrationPreviewAdapterCatalogSnapshot,
	MigrationPreviewAdapterOption,
	MigrationPreviewEvaluationPort,
	MigrationPreviewEvaluationRequest,
	MigrationPreviewEvaluationResult,
	MigrationPreviewTreeNode,
	MigrationPreviewWorkspaceSnapshot,
} from "./contracts.ts";

const targetAddress = (id: string): string => {
	const dialect = PANDWIND_API_DIALECTS.find(
		(candidate) => candidate.dialect === id || candidate.label === id,
	);
	if (dialect === undefined) return id;
	return dialect.dialect === SwapSourceId.Css
		? CodemodAdapterId.Pandwind
		: `${CodemodAdapterId.Pandwind}:${dialect.dialect}`;
};

const readPackageJson = (root: string): Readonly<Record<string, unknown>> | undefined => {
	try {
		return JSON.parse(readFileSync(`${root}/package.json`, "utf8")) as Readonly<
			Record<string, unknown>
		>;
	} catch {
		return undefined;
	}
};

const sourceAdapter = (
	adapters: readonly StyleAdapter[],
	file: string,
	source: string,
	root: string,
): StyleAdapter | undefined =>
	adapters
		.map((adapter) => ({
			adapter,
			result: adapter.detect({ file, source, root }),
		}))
		.filter(({ result }) => result.matched)
		.toSorted((left, right) => right.result.confidence - left.result.confidence)[0]?.adapter;

const diagnostic = (message: string, file?: string): MigrationPreviewDiagnostic => ({
	kind: "lowering",
	message,
	...(file === undefined ? {} : { file }),
});

const sourceTree = (
	workspace: MigrationPreviewWorkspaceSnapshot,
	results: readonly {
		file: string;
		outcomes: readonly { sourceStart: number; outcome: string }[];
	}[],
): readonly MigrationPreviewTreeNode[] => {
	const byFile = new Map(results.map((result) => [result.file, result]));
	return workspace.files.map(({ document }) => {
		const migration = byFile.get(document.file);
		return {
			id: document.file,
			label: relative(workspace.root, document.file) || document.file,
			kind: "unknown",
			file: document.file,
			children: (migration?.outcomes ?? []).map((outcome) => ({
				id: `${document.file}:${outcome.sourceStart}`,
				label: `${outcome.outcome} @ ${outcome.sourceStart}`,
				kind: "style",
				file: document.file,
				start: outcome.sourceStart,
				children: [],
			})),
		} satisfies MigrationPreviewTreeNode;
	});
};

const projectThemes = (
	root: string,
	activeScope: string | null,
	configWorkspace: ReturnType<typeof createSourceWorkspace>,
) => {
	const variables = new Map<string, { name: string; value: string; scope?: string }>();
	try {
		const entries = [...configWorkspace.files(["**/*.css"], root, { includeUnsupported: true })];
		for (const file of crawlCssImports(entries, root).contents) {
			for (const variable of parseThemeVars(file.content)) variables.set(variable.name, variable);
			for (const variable of parseThemeScopes(file.content))
				variables.set(`${variable.scope}\u0000${variable.name}`, variable);
		}
	} catch {
		return { scopes: [], activeScope };
	}
	const scopes = new Map<string, Array<{ name: string; value: string }>>();
	for (const variable of variables.values()) {
		const selector = variable.scope ?? ":root";
		const scope = scopes.get(selector) ?? [];
		scope.push({ name: variable.name, value: variable.value });
		scopes.set(selector, scope);
	}
	return {
		scopes: [...scopes].map(([selector, variables]) => ({ selector, variables })),
		activeScope,
	};
};

/**
 * Node-side MigrationPreview evaluator. It is deliberately a composition adapter over
 * the existing codemod registry: detection, official config loading, parsing,
 * lowering, emission, and validation remain owned by their adapters.
 */
const adapterOption = (adapter: StyleAdapter): MigrationPreviewAdapterOption => ({
	id: adapter.id,
	label: adapter.id,
	role: "both",
});

export const createMigrationPreviewCodemodEvaluator = (): MigrationPreviewEvaluationPort &
	MigrationPreviewAdapterCatalogPort => {
	const catalog = createBuiltinCodemodCatalog();
	const configWorkspace = createSourceWorkspace();
	const options = (): MigrationPreviewAdapterCatalogSnapshot => {
		const adapters = catalog.adapters.map(adapterOption);
		const targets = [
			...PANDWIND_API_DIALECTS.map(({ label }) => ({
				id: label,
				label,
				role: "target" as const,
			})),
			...adapters,
		].filter(
			(option, index, all) => all.findIndex((candidate) => candidate.id === option.id) === index,
		);
		return { sources: adapters, targets };
	};

	return {
		async list() {
			return options();
		},
		async evaluate(
			request: MigrationPreviewEvaluationRequest,
		): Promise<MigrationPreviewEvaluationResult> {
			const target = request.target;
			const selected = request.selection?.file;
			const documents = request.workspace.files.filter(
				({ document }) => selected === undefined || document.file === selected,
			);
			const diagnostics: MigrationPreviewDiagnostic[] = [];
			for (const file of request.workspace.conflicts ?? [])
				diagnostics.push({
					kind: "workspace",
					file,
					message:
						"Disk changed while this file has an in-memory migration preview edit; reopen to reload",
				});
			if (target === null) {
				return {
					execution: {
						lane: MIGRATION_PREVIEW_EXECUTION_LANE.InProcess,
						verified: [],
						unavailable: [
							MIGRATION_PREVIEW_EVIDENCE_CHECK.ProjectTypecheck,
							MIGRATION_PREVIEW_EVIDENCE_CHECK.ProjectBuild,
							MIGRATION_PREVIEW_EVIDENCE_CHECK.BrowserHost,
							MIGRATION_PREVIEW_EVIDENCE_CHECK.SsrHydration,
						],
						note: "Migration preview has no selected target; no migration pipeline was run.",
					},
					diagnostics: [diagnostic("Choose a target adapter to evaluate this workspace")],
					tree: { roots: sourceTree(request.workspace, []) },
					themes: projectThemes(request.workspace.root, request.theme.scope, configWorkspace),
				};
			}

			const sourceCode: string[] = [];
			const targetCode: string[] = [];
			const sourceCss: string[] = [];
			const targetCss: string[] = [];
			const semanticPrograms: unknown[] = [];
			const migrations: Array<{
				file: string;
				converted: number;
				residuals: number;
				outcomes: readonly { sourceStart: number; outcome: string }[];
			}> = [];
			const generatedFiles = new Map<string, { path: string; content: string; source?: string }>();
			const sourceFiles = new Map(
				request.workspace.files.map(({ document }) => [document.file, document.source]),
			);
			const readFile = (file: string): string | undefined => {
				const overlay = sourceFiles.get(file);
				if (overlay !== undefined) return overlay;
				try {
					return readFileSync(file, "utf8");
				} catch {
					return undefined;
				}
			};
			const listFiles = (root: string): readonly string[] =>
				configWorkspace.files(["**/*"], root, { includeUnsupported: true });
			const packageJson = readPackageJson(request.workspace.root);

			for (const { document, scan } of documents) {
				sourceCode.push(
					`// ${relative(request.workspace.root, document.file)}\n${document.source}`,
				);
				for (const scanDiagnostic of scan.diagnostics)
					diagnostics.push({
						kind: "parse",
						message: scanDiagnostic.message,
						file: document.file,
					});
				const sourceId = target.source === undefined ? undefined : targetAddress(target.source);
				const source =
					(sourceId === undefined
						? sourceAdapter(
								catalog.adapters,
								document.file,
								document.source,
								request.workspace.root,
							)
						: catalog.adapters.find((adapter) => adapter.id === sourceId)) ?? undefined;
				if (source === undefined) {
					diagnostics.push(diagnostic("No source adapter matched this document", document.file));
					continue;
				}
				try {
					const result = await runAdapterMigrationAsync(document.source, {
						from: source.id,
						to: targetAddress(target.target),
						file: document.file,
						root: request.workspace.root,
						packageJson,
						readFile,
						listFiles,
						adapterRegistry: catalog.registry,
					});
					targetCode.push(`// ${relative(request.workspace.root, document.file)}\n${result.code}`);
					migrations.push({
						file: document.file,
						converted: result.converted,
						residuals: result.residuals.length,
						outcomes: result.outcomes.map(({ sourceStart, outcome }) => ({
							sourceStart,
							outcome,
						})),
					});
					semanticPrograms.push(...result.loweringPlans.map(({ program }) => program));
					for (const validation of result.validations) {
						if (validation.canonicalSource !== undefined)
							sourceCss.push(validation.canonicalSource);
						if (validation.canonicalTarget !== undefined)
							targetCss.push(validation.canonicalTarget);
					}
					for (const residual of result.residuals)
						diagnostics.push(
							diagnostic(
								`${residual.text}${residual.hint === undefined ? "" : `: ${residual.hint}`}`,
								document.file,
							),
						);
					for (const file of result.generatedFiles)
						if (!generatedFiles.has(file.path))
							generatedFiles.set(file.path, { ...file, source: document.file });
				} catch (error) {
					diagnostics.push(
						diagnostic(error instanceof Error ? error.message : String(error), document.file),
					);
				}
			}

			const sourceText = sourceCode.join("\n\n");
			const targetText = targetCode.join("\n\n");
			return {
				execution: {
					lane: MIGRATION_PREVIEW_EXECUTION_LANE.InProcess,
					verified: [
						MIGRATION_PREVIEW_EVIDENCE_CHECK.Migration,
						MIGRATION_PREVIEW_EVIDENCE_CHECK.CanonicalCss,
					],
					unavailable: [
						MIGRATION_PREVIEW_EVIDENCE_CHECK.ProjectTypecheck,
						MIGRATION_PREVIEW_EVIDENCE_CHECK.ProjectBuild,
						MIGRATION_PREVIEW_EVIDENCE_CHECK.BrowserHost,
						MIGRATION_PREVIEW_EVIDENCE_CHECK.SsrHydration,
					],
					note: "Migration preview runs registered adapters in process; host build and browser checks require an explicit preview host.",
				},
				diagnostics,
				tree: { roots: sourceTree(request.workspace, migrations) },
				themes: projectThemes(request.workspace.root, request.theme.scope, configWorkspace),
				semantic: { migrations, programs: semanticPrograms },
				artifacts: {
					sourceCode: sourceText,
					targetCode: targetText,
					...(sourceCss.length === 0 ? {} : { sourceCss: sourceCss.join("\n\n") }),
					...(targetCss.length === 0 ? {} : { targetCss: targetCss.join("\n\n") }),
					files: [...generatedFiles.values()],
					sourceBytes: Buffer.byteLength(sourceText),
					targetBytes: Buffer.byteLength(targetText),
				},
			};
		},
	};
};
