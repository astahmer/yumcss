import type { SourceDocument, SourceScanResult } from "pandwind/source";

export const STUDIO_SESSION_SCHEMA = "pandwind.studio-session/1" as const;
export const STUDIO_SNAPSHOT_SCHEMA = "pandwind.studio-snapshot/1" as const;

export interface StudioOpenRequest {
	readonly root: string;
	readonly patterns?: readonly string[];
}

export interface StudioEditRequest {
	readonly file: string;
	readonly source: string;
}

export interface StudioSelection {
	readonly file: string;
	readonly start?: number;
	readonly end?: number;
}

export interface StudioTargetSelection {
	readonly source?: string;
	readonly target: string;
}

export interface StudioThemeSelection {
	readonly scope: string | null;
}

export interface StudioWorkspaceSnapshot {
	readonly revision: number;
	readonly root: string;
	readonly files: readonly StudioDocument[];
}

export interface StudioDocument {
	readonly document: SourceDocument;
	readonly scan: SourceScanResult;
}

export interface StudioEvaluationRequest {
	readonly workspace: StudioWorkspaceSnapshot;
	readonly selection: StudioSelection | null;
	readonly target: StudioTargetSelection | null;
	readonly theme: StudioThemeSelection;
}

export interface StudioEvaluationResult {
	readonly semantic?: unknown;
	readonly artifacts?: StudioArtifactSnapshot;
	readonly tree?: StudioTreeSnapshot;
	readonly themes?: StudioThemeSnapshot;
	readonly diagnostics: readonly StudioDiagnostic[];
}

export type StudioAdapterRole = "source" | "target" | "both";

export interface StudioAdapterOption {
	readonly id: string;
	readonly label: string;
	readonly role: StudioAdapterRole;
}

export interface StudioAdapterCatalogSnapshot {
	readonly sources: readonly StudioAdapterOption[];
	readonly targets: readonly StudioAdapterOption[];
}

export interface StudioAdapterCatalogPort {
	list(): Promise<StudioAdapterCatalogSnapshot>;
}

export interface StudioArtifactSnapshot {
	readonly sourceCode?: string;
	readonly targetCode?: string;
	readonly sourceCss?: string;
	readonly targetCss?: string;
	readonly files: readonly StudioGeneratedFile[];
	readonly sourceBytes?: number;
	readonly targetBytes?: number;
	readonly sourceHash?: string;
	readonly targetHash?: string;
}

export interface StudioGeneratedFile {
	readonly path: string;
	readonly content: string;
	readonly source?: string;
}

export interface StudioTreeSnapshot {
	readonly roots: readonly StudioTreeNode[];
}

export interface StudioTreeNode {
	readonly id: string;
	readonly label: string;
	readonly kind: "component" | "style" | "host" | "unknown";
	readonly file?: string;
	readonly start?: number;
	readonly end?: number;
	readonly children: readonly StudioTreeNode[];
}

export interface StudioThemeSnapshot {
	readonly scopes: readonly StudioThemeScope[];
	readonly activeScope: string | null;
}

export interface StudioThemeScope {
	readonly selector: string;
	readonly variables: readonly { name: string; value: string }[];
}

export interface StudioDiagnostic {
	readonly kind: "configuration" | "parse" | "lowering" | "validation" | "host" | "workspace";
	readonly message: string;
	readonly file?: string;
	readonly start?: number;
	readonly end?: number;
}

export interface StudioSnapshot {
	readonly schema: typeof STUDIO_SNAPSHOT_SCHEMA;
	readonly revision: number;
	readonly workspace: StudioWorkspaceSnapshot;
	readonly selection: StudioSelection | null;
	readonly target: StudioTargetSelection | null;
	readonly theme: StudioThemeSelection;
	readonly evaluation: StudioEvaluationResult | null;
	readonly adapters?: StudioAdapterCatalogSnapshot;
}

export interface StudioWorkspacePort {
	open(request: StudioOpenRequest): Promise<StudioWorkspaceSnapshot>;
	edit(request: StudioEditRequest): Promise<StudioWorkspaceSnapshot>;
	subscribe(listener: (workspace: StudioWorkspaceSnapshot) => void): () => void;
	close?(): Promise<void>;
}

export interface StudioEvaluationPort {
	evaluate(request: StudioEvaluationRequest): Promise<StudioEvaluationResult>;
}

export interface StudioSessionDependencies {
	readonly workspace: StudioWorkspacePort;
	readonly evaluation: StudioEvaluationPort;
	readonly adapters?: StudioAdapterCatalogPort;
}

export interface StudioPreviewHostPort {
	readonly id: string;
	readonly available: boolean;
	start?(request: StudioOpenRequest): Promise<void>;
	stop?(): Promise<void>;
}

export interface StudioSession {
	readonly schema: typeof STUDIO_SESSION_SCHEMA;
	open(request: StudioOpenRequest): Promise<StudioSnapshot>;
	edit(request: StudioEditRequest): Promise<StudioSnapshot>;
	select(selection: StudioSelection): Promise<StudioSnapshot>;
	switchTarget(target: StudioTargetSelection): Promise<StudioSnapshot>;
	switchTheme(theme: StudioThemeSelection): Promise<StudioSnapshot>;
	subscribe(listener: (snapshot: StudioSnapshot) => void): () => void;
	close(): Promise<void>;
}
