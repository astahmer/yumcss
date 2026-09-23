import type { SourceDocument, SourceScanResult } from "pandwind/source";

export const MIGRATION_PREVIEW_SESSION_SCHEMA = "pandwind.migration-preview-session/1" as const;
export const MIGRATION_PREVIEW_SNAPSHOT_SCHEMA = "pandwind.migration-preview-snapshot/1" as const;

export const MIGRATION_PREVIEW_EXECUTION_LANE = {
	InProcess: "in-process",
	HostPreview: "host-preview",
} as const;

export type MigrationPreviewExecutionLane =
	(typeof MIGRATION_PREVIEW_EXECUTION_LANE)[keyof typeof MIGRATION_PREVIEW_EXECUTION_LANE];

export const MIGRATION_PREVIEW_EVIDENCE_CHECK = {
	Migration: "migration",
	CanonicalCss: "canonical-css",
	ProjectTypecheck: "project-typecheck",
	ProjectBuild: "project-build",
	BrowserHost: "browser-host",
	SsrHydration: "ssr-hydration",
} as const;

export type MigrationPreviewEvidenceCheck =
	(typeof MIGRATION_PREVIEW_EVIDENCE_CHECK)[keyof typeof MIGRATION_PREVIEW_EVIDENCE_CHECK];

export interface MigrationPreviewExecutionEvidence {
	readonly lane: MigrationPreviewExecutionLane;
	readonly verified: readonly MigrationPreviewEvidenceCheck[];
	readonly unavailable: readonly MigrationPreviewEvidenceCheck[];
	readonly note: string;
}

export interface MigrationPreviewOpenRequest {
	readonly root: string;
	readonly patterns?: readonly string[];
}

export interface MigrationPreviewEditRequest {
	readonly file: string;
	readonly source: string;
}

export interface MigrationPreviewSelection {
	readonly file: string;
	readonly start?: number;
	readonly end?: number;
}

export interface MigrationPreviewTargetSelection {
	readonly source?: string;
	readonly target: string;
}

export interface MigrationPreviewThemeSelection {
	readonly scope: string | null;
}

export interface MigrationPreviewWorkspaceSnapshot {
	readonly revision: number;
	readonly root: string;
	readonly files: readonly MigrationPreviewDocument[];
	readonly conflicts?: readonly string[];
}

export interface MigrationPreviewDocument {
	readonly document: SourceDocument;
	readonly scan: SourceScanResult;
}

export interface MigrationPreviewEvaluationRequest {
	readonly workspace: MigrationPreviewWorkspaceSnapshot;
	readonly selection: MigrationPreviewSelection | null;
	readonly target: MigrationPreviewTargetSelection | null;
	readonly theme: MigrationPreviewThemeSelection;
}

export interface MigrationPreviewEvaluationResult {
	readonly execution?: MigrationPreviewExecutionEvidence;
	readonly semantic?: unknown;
	readonly artifacts?: MigrationPreviewArtifactSnapshot;
	readonly tree?: MigrationPreviewTreeSnapshot;
	readonly themes?: MigrationPreviewThemeSnapshot;
	readonly diagnostics: readonly MigrationPreviewDiagnostic[];
}

export type MigrationPreviewAdapterRole = "source" | "target" | "both";

export interface MigrationPreviewAdapterOption {
	readonly id: string;
	readonly label: string;
	readonly role: MigrationPreviewAdapterRole;
}

export interface MigrationPreviewAdapterCatalogSnapshot {
	readonly sources: readonly MigrationPreviewAdapterOption[];
	readonly targets: readonly MigrationPreviewAdapterOption[];
}

export interface MigrationPreviewAdapterCatalogPort {
	list(): Promise<MigrationPreviewAdapterCatalogSnapshot>;
}

export interface MigrationPreviewArtifactSnapshot {
	readonly sourceCode?: string;
	readonly targetCode?: string;
	readonly sourceCss?: string;
	readonly targetCss?: string;
	readonly files: readonly MigrationPreviewGeneratedFile[];
	readonly sourceBytes?: number;
	readonly targetBytes?: number;
	readonly sourceHash?: string;
	readonly targetHash?: string;
}

export interface MigrationPreviewGeneratedFile {
	readonly path: string;
	readonly content: string;
	readonly source?: string;
}

export interface MigrationPreviewTreeSnapshot {
	readonly roots: readonly MigrationPreviewTreeNode[];
}

export interface MigrationPreviewTreeNode {
	readonly id: string;
	readonly label: string;
	readonly kind: "component" | "style" | "host" | "unknown";
	readonly file?: string;
	readonly start?: number;
	readonly end?: number;
	readonly children: readonly MigrationPreviewTreeNode[];
}

export interface MigrationPreviewThemeSnapshot {
	readonly scopes: readonly MigrationPreviewThemeScope[];
	readonly activeScope: string | null;
}

export interface MigrationPreviewThemeScope {
	readonly selector: string;
	readonly variables: readonly { name: string; value: string }[];
}

export interface MigrationPreviewRequest {
	readonly workspace: MigrationPreviewWorkspaceSnapshot;
	readonly selection: MigrationPreviewSelection | null;
	readonly target: MigrationPreviewTargetSelection | null;
	readonly theme: MigrationPreviewThemeSelection;
	readonly evaluation: MigrationPreviewEvaluationResult;
}

export type MigrationPreviewStatus = "unavailable" | "starting" | "ready" | "error";

export interface MigrationPreviewHostSnapshot {
	readonly host: string;
	readonly status: MigrationPreviewStatus;
	readonly message?: string;
	readonly url?: string;
	readonly computedStyles?: Readonly<Record<string, string>>;
	readonly stylesheetBytes?: number;
}

export interface MigrationPreviewDiagnostic {
	readonly kind: "configuration" | "parse" | "lowering" | "validation" | "host" | "workspace";
	readonly message: string;
	readonly file?: string;
	readonly start?: number;
	readonly end?: number;
}

export interface MigrationPreviewSnapshot {
	readonly schema: typeof MIGRATION_PREVIEW_SNAPSHOT_SCHEMA;
	readonly revision: number;
	readonly workspace: MigrationPreviewWorkspaceSnapshot;
	readonly selection: MigrationPreviewSelection | null;
	readonly target: MigrationPreviewTargetSelection | null;
	readonly theme: MigrationPreviewThemeSelection;
	readonly evaluation: MigrationPreviewEvaluationResult | null;
	readonly adapters?: MigrationPreviewAdapterCatalogSnapshot;
	readonly preview?: MigrationPreviewHostSnapshot;
}

export interface MigrationPreviewWorkspacePort {
	open(request: MigrationPreviewOpenRequest): Promise<MigrationPreviewWorkspaceSnapshot>;
	edit(request: MigrationPreviewEditRequest): Promise<MigrationPreviewWorkspaceSnapshot>;
	subscribe(listener: (workspace: MigrationPreviewWorkspaceSnapshot) => void): () => void;
	close?(): Promise<void>;
}

export interface MigrationPreviewEvaluationPort {
	evaluate(request: MigrationPreviewEvaluationRequest): Promise<MigrationPreviewEvaluationResult>;
}

export interface MigrationPreviewSessionDependencies {
	readonly workspace: MigrationPreviewWorkspacePort;
	readonly evaluation: MigrationPreviewEvaluationPort;
	readonly adapters?: MigrationPreviewAdapterCatalogPort;
	readonly preview?: MigrationPreviewHostPort;
}

export interface MigrationPreviewHostPort {
	readonly id: string;
	readonly available: boolean;
	start?(request: MigrationPreviewRequest): Promise<MigrationPreviewHostSnapshot>;
	update?(request: MigrationPreviewRequest): Promise<MigrationPreviewHostSnapshot>;
	stop?(): Promise<void>;
}

export interface MigrationPreviewSession {
	readonly schema: typeof MIGRATION_PREVIEW_SESSION_SCHEMA;
	open(request: MigrationPreviewOpenRequest): Promise<MigrationPreviewSnapshot>;
	edit(request: MigrationPreviewEditRequest): Promise<MigrationPreviewSnapshot>;
	select(selection: MigrationPreviewSelection): Promise<MigrationPreviewSnapshot>;
	switchTarget(target: MigrationPreviewTargetSelection): Promise<MigrationPreviewSnapshot>;
	switchTheme(theme: MigrationPreviewThemeSelection): Promise<MigrationPreviewSnapshot>;
	subscribe(listener: (snapshot: MigrationPreviewSnapshot) => void): () => void;
	close(): Promise<void>;
}
