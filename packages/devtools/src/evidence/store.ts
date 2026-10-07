import type { StyleProgram } from "@yumcss/codemod/swap/semantic-ir";

export const DEVTOOLS_EVIDENCE_SCHEMA = "yumcss.devtools.evidence/1" as const;

export const DevtoolsEvidenceKind = {
	Transform: "transform",
	Scan: "scan",
	StyleProgram: "style-program",
	Diagnostic: "diagnostic",
	Token: "token",
	Migration: "migration",
	Runtime: "runtime",
} as const;
export type DevtoolsEvidenceKind = (typeof DevtoolsEvidenceKind)[keyof typeof DevtoolsEvidenceKind];

export interface DevtoolsTransformRecord {
	readonly file: string;
	readonly bytes: number;
	readonly durationMs: number;
	readonly updatedAt: number;
	readonly transformCount: number;
}

export interface DevtoolsScanRecord {
	readonly file: string;
	readonly language: string;
	readonly framework?: string;
	readonly diagnosticCount: number;
	readonly excludedRangeCount: number;
	readonly updatedAt: number;
}

export interface DevtoolsStyleProgramRecord {
	readonly id: string;
	readonly file?: string;
	readonly label?: string;
	readonly program: StyleProgram;
	readonly updatedAt: number;
}

export interface DevtoolsDiagnosticRecord {
	readonly id: string;
	readonly severity: "error" | "warning" | "info";
	readonly message: string;
	readonly file?: string;
	readonly start?: number;
	readonly end?: number;
	readonly source: string;
	readonly updatedAt: number;
}

export interface DevtoolsTokenRecord {
	readonly name: string;
	readonly value: string | number;
	readonly kind: "raw" | "semantic" | "component" | "unknown";
	readonly theme?: string;
	readonly files: readonly string[];
}

export interface DevtoolsMigrationRecord {
	readonly id: string;
	readonly from: string;
	readonly to: string;
	readonly files: readonly string[];
	readonly changed: number;
	readonly residuals: number;
	readonly updatedAt: number;
}

export interface DevtoolsRuntimeRecord {
	readonly event: string;
	readonly file?: string;
	readonly durationMs?: number;
	readonly updatedAt: number;
}

export interface DevtoolsEvidenceSnapshot {
	readonly schema: typeof DEVTOOLS_EVIDENCE_SCHEMA;
	readonly root: string;
	readonly transforms: readonly DevtoolsTransformRecord[];
	readonly scans: readonly DevtoolsScanRecord[];
	readonly stylePrograms: readonly DevtoolsStyleProgramRecord[];
	readonly diagnostics: readonly DevtoolsDiagnosticRecord[];
	readonly tokens: readonly DevtoolsTokenRecord[];
	readonly migrations: readonly DevtoolsMigrationRecord[];
	readonly runtime: readonly DevtoolsRuntimeRecord[];
	readonly selected?: DevtoolsSelection;
}

/** A CSS rule from the page's stylesheets that targets one of the selected element's classes. */
export interface DevtoolsClassRule {
	readonly className: string;
	readonly selector: string;
	/** Enclosing at-rules, outermost first, e.g. `@media (min-width: 768px)`. */
	readonly conditions: readonly string[];
	readonly declarations: string;
}

export interface DevtoolsSelection {
	readonly tagName?: string;
	readonly className?: string;
	readonly classNames: readonly string[];
	readonly attributes: Readonly<Record<string, string>>;
	readonly computedStyles: Readonly<Record<string, string>>;
	readonly classRules: readonly DevtoolsClassRule[];
	readonly matchedPrograms: readonly string[];
	readonly selectedAt: number;
}

export interface StyleArtifactEventPort {
	recordStyleProgram(record: Omit<DevtoolsStyleProgramRecord, "updatedAt">): void;
	recordToken(record: DevtoolsTokenRecord): void;
	recordDiagnostic(record: Omit<DevtoolsDiagnosticRecord, "updatedAt">): void;
}

export interface RuntimeStyleEventPort {
	recordRuntime(record: Omit<DevtoolsRuntimeRecord, "updatedAt">): void;
}

export interface DevtoolsEvidenceStore extends StyleArtifactEventPort, RuntimeStyleEventPort {
	recordTransform(file: string, bytes: number, durationMs: number): void;
	recordScan(record: Omit<DevtoolsScanRecord, "updatedAt">): void;
	recordMigration(record: Omit<DevtoolsMigrationRecord, "updatedAt">): void;
	select(selection: Omit<DevtoolsSelection, "selectedAt">): void;
	snapshot(): DevtoolsEvidenceSnapshot;
}

const byNewest = <T extends { readonly updatedAt: number }>(records: readonly T[]): T[] =>
	[...records].toSorted((a, b) => b.updatedAt - a.updatedAt);

export function createDevtoolsEvidenceStore(root: string): DevtoolsEvidenceStore {
	const transforms = new Map<string, DevtoolsTransformRecord>();
	const scans = new Map<string, DevtoolsScanRecord>();
	const stylePrograms = new Map<string, DevtoolsStyleProgramRecord>();
	const diagnostics = new Map<string, DevtoolsDiagnosticRecord>();
	const tokens = new Map<string, DevtoolsTokenRecord>();
	const migrations = new Map<string, DevtoolsMigrationRecord>();
	const runtime: DevtoolsRuntimeRecord[] = [];
	let selected: DevtoolsSelection | undefined;

	return {
		recordTransform(file, bytes, durationMs) {
			const previous = transforms.get(file);
			transforms.set(file, {
				file,
				bytes,
				durationMs,
				updatedAt: Date.now(),
				transformCount: (previous?.transformCount ?? 0) + 1,
			});
		},
		recordScan(record) {
			scans.set(record.file, { ...record, updatedAt: Date.now() });
		},
		recordStyleProgram(record) {
			stylePrograms.set(record.id, { ...record, updatedAt: Date.now() });
		},
		recordDiagnostic(record) {
			diagnostics.set(record.id, { ...record, updatedAt: Date.now() });
		},
		recordToken(record) {
			tokens.set(`${record.theme ?? "default"}:${record.name}`, record);
		},
		recordMigration(record) {
			migrations.set(record.id, { ...record, updatedAt: Date.now() });
		},
		recordRuntime(record) {
			runtime.push({ ...record, updatedAt: Date.now() });
			if (runtime.length > 200) runtime.splice(0, runtime.length - 200);
		},
		select(value) {
			selected = { ...value, selectedAt: Date.now() };
		},
		snapshot() {
			return {
				schema: DEVTOOLS_EVIDENCE_SCHEMA,
				root,
				transforms: byNewest([...transforms.values()]),
				scans: byNewest([...scans.values()]),
				stylePrograms: byNewest([...stylePrograms.values()]),
				diagnostics: byNewest([...diagnostics.values()]),
				tokens: [...tokens.values()].toSorted((a, b) => a.name.localeCompare(b.name)),
				migrations: byNewest([...migrations.values()]),
				runtime: [...runtime].toReversed(),
				...(selected === undefined ? {} : { selected }),
			};
		},
	};
}
