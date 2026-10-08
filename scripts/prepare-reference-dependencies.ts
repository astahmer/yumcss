import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
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
	readonly linkProject?: string;
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
 * checkouts, never into the YumCSS tree and never committed with the source.
 * Keep versions explicit even when an upstream example declares `latest` so
 * the official-config proof remains reproducible.
 */
const INSTALLS: readonly ReferenceDependencyInstall[] = [
	{
		reference: "shadcn-ui",
		kind: REFERENCE_DEPENDENCY_INSTALL_KIND.NpmProject,
		project: ".yumcss-css-dependencies",
		packages: ["tailwindcss@4.3.3", "tw-animate-css@1.4.0", "shadcn@4.19.0"],
		linkProject: "apps/v4",
	},
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
	const environment = { ...process.env };
	// Reference package scripts must run under their own Node/tsx setup. When
	// this helper is called through Nub, its preload is inherited by pnpm and
	// changes CommonJS-oriented postbuild scripts such as Panda's __dirname use.
	delete environment.NODE_OPTIONS;
	delete environment.NODE_PATH;
	if (environment.PATH !== undefined) {
		environment.PATH = environment.PATH.split(delimiter)
			.filter((entry) => !entry.includes("nub-node-shim-"))
			.join(delimiter);
	}
	execFileSync(command, [...args], {
		cwd,
		stdio: options.log === false ? "ignore" : "inherit",
		env: environment,
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
			if (entry.linkProject !== undefined) {
				mkdirSync(project, { recursive: true });
				writeFileSync(join(project, "package.json"), JSON.stringify({ private: true }));
			}
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
			if (entry.linkProject !== undefined) {
				const modules = join(referenceRoot, entry.linkProject, "node_modules");
				mkdirSync(modules, { recursive: true });
				for (const specifier of entry.packages) {
					const name = specifier.slice(0, specifier.lastIndexOf("@"));
					const destination = join(modules, name);
					if (!existsSync(destination))
						symlinkSync(join(project, "node_modules", name), destination, "dir");
				}
			}
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
