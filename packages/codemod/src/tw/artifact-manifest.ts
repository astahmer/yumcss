import { createHash } from "node:crypto";

/** Provenance contract for generated YumCSS design-system files. */
export const YUMCSS_GENERATED_MANIFEST_SCHEMA = "yumcss.generated/1" as const;

/** Runtime-safe ownership tags used by generated-artifact manifests. */
export const GeneratedArtifactOwnershipTag = {
	Runtime: "runtime",
	BuildOnly: "build-only",
	Editor: "editor",
	Optional: "optional",
} as const;

export type GeneratedArtifactOwnershipTag =
	(typeof GeneratedArtifactOwnershipTag)[keyof typeof GeneratedArtifactOwnershipTag];

export interface GeneratedArtifactInput {
	readonly path: string;
	readonly content: string;
}

export interface GeneratedArtifactEntry {
	readonly path: string;
	readonly ownership: GeneratedArtifactOwnershipTag;
	readonly hash: string;
}

export interface YumCSSGeneratedManifest {
	readonly schema: typeof YUMCSS_GENERATED_MANIFEST_SCHEMA;
	readonly generator: "yumcss-codemod tw generate";
	readonly inputs: readonly { readonly path: string; readonly hash: string }[];
	readonly artifacts: readonly GeneratedArtifactEntry[];
}

export interface GeneratedArtifactManifestOptions {
	readonly inputs: readonly GeneratedArtifactInput[];
	readonly artifacts: readonly {
		readonly path: string;
		readonly ownership: GeneratedArtifactOwnershipTag;
		readonly content: string;
	}[];
}

export function hashGeneratedContent(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

export function buildGeneratedArtifactManifest(
	options: GeneratedArtifactManifestOptions,
): YumCSSGeneratedManifest {
	return {
		schema: YUMCSS_GENERATED_MANIFEST_SCHEMA,
		generator: "yumcss-codemod tw generate",
		inputs: options.inputs
			.map(({ path, content }) => ({ path, hash: hashGeneratedContent(content) }))
			.toSorted((left, right) => left.path.localeCompare(right.path, "en")),
		artifacts: options.artifacts
			.map(({ path, ownership, content }) => ({
				path,
				ownership,
				hash: hashGeneratedContent(content),
			}))
			.toSorted((left, right) => left.path.localeCompare(right.path, "en")),
	};
}
