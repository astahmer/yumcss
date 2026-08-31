import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createReferenceWorkspace } from "./reference-workspace.ts";

interface ReferenceDependencyInstall {
	readonly reference: string;
	readonly project: string;
	readonly packages: readonly string[];
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
		project: "examples/next",
		packages: ["unocss@66.8.1"],
	},
];

function install(workspace: ReturnType<typeof createReferenceWorkspace>): void {
	for (const entry of INSTALLS) {
		const project = join(workspace.path(entry.reference), entry.project);
		if (!existsSync(join(project, "package.json")))
			throw new Error(`reference project is not prepared: ${project}`);
		execFileSync(
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
			{ stdio: "inherit" },
		);
		console.log(`${entry.reference}/${entry.project}: installed ${entry.packages.join(", ")}`);
	}
}

if (import.meta.main) install(createReferenceWorkspace());
