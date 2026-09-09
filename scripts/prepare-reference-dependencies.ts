import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createReferenceWorkspace } from "./reference-workspace.ts";
import { resolveReferenceCheckoutId } from "./reference-repository-catalog.ts";

export const REFERENCE_DEPENDENCY_INSTALL_KIND = {
	NpmProject: "npm-project",
	PnpmWorkspace: "pnpm-workspace",
} as const;

type ReferenceDependencyInstallKind =
	(typeof REFERENCE_DEPENDENCY_INSTALL_KIND)[keyof typeof REFERENCE_DEPENDENCY_INSTALL_KIND];

interface ReferenceDependencyInstallBase {
	readonly reference: string;
	readonly kind: ReferenceDependencyInstallKind;
}

interface NpmProjectDependencyInstall extends ReferenceDependencyInstallBase {
	readonly kind: typeof REFERENCE_DEPENDENCY_INSTALL_KIND.NpmProject;
	readonly project: string;
	readonly packages: readonly string[];
}

interface PnpmWorkspaceDependencyInstall extends ReferenceDependencyInstallBase {
	readonly kind: typeof REFERENCE_DEPENDENCY_INSTALL_KIND.PnpmWorkspace;
	readonly buildFilter: string;
}

type ReferenceDependencyInstall = NpmProjectDependencyInstall | PnpmWorkspaceDependencyInstall;

export interface PrepareReferenceDependenciesOptions {
	readonly log?: boolean;
}

/**
 * Dependencies needed by reference proofs are installed into disposable
 * checkouts, never into the Pandwind tree and never committed with the source.
 * Keep versions explicit even when an upstream example declares `latest` so
 * the official-config proof remains reproducible.
 */
const INSTALLS: readonly ReferenceDependencyInstall[] = [
	{
		reference: "unocss",
		kind: REFERENCE_DEPENDENCY_INSTALL_KIND.NpmProject,
		project: "examples/next",
		packages: ["unocss@66.8.1"],
	},
	{
		reference: "panda",
		kind: REFERENCE_DEPENDENCY_INSTALL_KIND.PnpmWorkspace,
		buildFilter: "@pandacss/dev...",
	},
];

function run(
	command: string,
	args: readonly string[],
	cwd: string,
	options: PrepareReferenceDependenciesOptions,
): void {
	execFileSync(command, [...args], {
		cwd,
		stdio: options.log === false ? "ignore" : "inherit",
	});
}

export function prepareReferenceDependencies(
	workspace: ReturnType<typeof createReferenceWorkspace>,
	ids?: readonly string[],
	options: PrepareReferenceDependenciesOptions = {},
): readonly string[] {
	const requested = ids === undefined ? undefined : new Set(ids.map(resolveReferenceCheckoutId));
	const installs = INSTALLS.filter(
		(entry) =>
			requested === undefined || requested.has(resolveReferenceCheckoutId(entry.reference)),
	);

	const results: string[] = [];
	for (const entry of installs) {
		const referenceRoot = workspace.path(entry.reference);
		if (entry.kind === REFERENCE_DEPENDENCY_INSTALL_KIND.NpmProject) {
			const project = join(referenceRoot, entry.project);
			if (!existsSync(join(project, "package.json")))
				throw new Error(`reference project is not prepared: ${project}`);
			run(
				"npm",
				[
					"install",
					"--prefix",
					project,
					"--ignore-scripts",
					"--no-save",
					"--no-package-lock",
					...entry.packages,
				],
				referenceRoot,
				options,
			);
			results.push(`${entry.reference}/${entry.project}: installed ${entry.packages.join(", ")}`);
			continue;
		}

		if (!existsSync(join(referenceRoot, "package.json")))
			throw new Error(`reference workspace is not prepared: ${referenceRoot}`);
		run("pnpm", ["install", "--frozen-lockfile", "--ignore-scripts"], referenceRoot, options);
		// The installed-project proofs run the reference's TypeScript checker. The
		// fast Panda build intentionally skips declarations, so it cannot be used
		// to prepare a typecheckable reference workspace.
		run("pnpm", ["--filter", entry.buildFilter, "build"], referenceRoot, options);
		results.push(
			`${entry.reference}: installed the workspace lockfile and built ${entry.buildFilter}`,
		);
	}

	if (options.log !== false) {
		for (const result of results) console.log(result);
	}
	return results;
}

if (import.meta.main) prepareReferenceDependencies(createReferenceWorkspace());
