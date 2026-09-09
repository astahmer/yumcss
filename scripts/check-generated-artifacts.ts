import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildGeneratedArtifactManifest, GeneratedArtifactOwnershipTag } from "pandwind-codemod/tw";

const repositoryRoot = resolve(import.meta.dirname, "..");

const generatedFiles = [
	"types.d.ts",
	"tw.ts",
	"bridge.ts",
	"pandwind.interop.json",
	"pandwind.generated.json",
	"pandwind-theme.css",
] as const;

interface GeneratedApp {
	readonly name: string;
	readonly filter: string;
	readonly root: string;
	readonly source: string;
	readonly tokens: string;
	readonly formatFiles: readonly string[];
}

const apps: readonly GeneratedApp[] = [
	{
		name: "example",
		filter: "example",
		root: resolve(repositoryRoot, "examples/example"),
		source: resolve(repositoryRoot, "examples/example/src/tailwind.css"),
		tokens: "@pandwind/example-preset",
		formatFiles: ["bridge.ts", "pandwind-theme.css", "pandwind.interop.json"],
	},
	{
		name: "playground",
		filter: "playground",
		root: resolve(repositoryRoot, "apps/playground"),
		source: resolve(repositoryRoot, "apps/playground/src/tailwind.css"),
		tokens: "@pandwind/example-preset",
		formatFiles: ["types.d.ts", "tw.ts", "bridge.ts", "pandwind-theme.css"],
	},
];

const run = (command: string, args: readonly string[], cwd = repositoryRoot): void => {
	try {
		execFileSync(command, [...args], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (error) {
		const failure = error as { stderr?: string; stdout?: string; message?: string };
		const detail = (failure.stderr ?? failure.stdout ?? failure.message ?? "")
			.trim()
			.split("\n")
			.slice(-8)
			.join("\n");
		throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`, {
			cause: error,
		});
	}
};

const normalizeInterop = (content: string): string => {
	const artifact = JSON.parse(content) as {
		generatedFrom?: Record<string, string>;
	};
	if (artifact.generatedFrom !== undefined) {
		artifact.generatedFrom = Object.fromEntries(
			Object.entries(artifact.generatedFrom).map(([key, value]) => [key, basename(value)]),
		);
	}
	return `${JSON.stringify(artifact, null, "\t")}\n`;
};

const comparableContent = (path: string, content: string): string =>
	path.endsWith("pandwind.interop.json") ? normalizeInterop(content) : content;

const refreshCommand = (app: GeneratedApp): string => `pnpm --filter ${app.filter} run tw:generate`;

const checkApp = (app: GeneratedApp): void => {
	const temporaryRoot = mkdtempSync(join(tmpdir(), `pandwind-${app.name}-generated-`));
	const temporarySourceRoot = join(temporaryRoot, "src");
	try {
		run(
			"pnpm",
			[
				"exec",
				"pandwind-codemod",
				"tw",
				"generate",
				"./src/tailwind.css",
				temporarySourceRoot,
				"--tokens",
				app.tokens,
				"--preset-import",
				app.tokens,
				"--preset-export",
				"examplePreset",
				"--bridge",
			],
			app.root,
		);

		const formatTargets = app.formatFiles
			.map((file) => join(temporarySourceRoot, file))
			.filter((path) => existsSync(path));
		run("pnpm", ["exec", "oxfmt", ...formatTargets], app.root);
		const manifest = buildGeneratedArtifactManifest({
			inputs: [{ path: relative(app.root, app.source), content: readFileSync(app.source, "utf8") }],
			artifacts: [
				["types.d.ts", GeneratedArtifactOwnershipTag.Editor],
				["tw.ts", GeneratedArtifactOwnershipTag.Runtime],
				["pandwind.interop.json", GeneratedArtifactOwnershipTag.BuildOnly],
				["pandwind-theme.css", GeneratedArtifactOwnershipTag.Runtime],
				["pandwind.agents.json", GeneratedArtifactOwnershipTag.Editor],
				["bridge.ts", GeneratedArtifactOwnershipTag.Optional],
			].flatMap(([name, ownership]) => {
				const path = join(temporarySourceRoot, name);
				return existsSync(path)
					? [
							{
								path: relative(temporaryRoot, path).replaceAll("\\", "/"),
								ownership,
								content: readFileSync(path, "utf8"),
							},
						]
					: [];
			}),
		});
		writeFileSync(
			join(temporarySourceRoot, "pandwind.generated.json"),
			`${JSON.stringify(manifest, null, "\t")}\n`,
		);

		const stale: string[] = [];
		for (const file of generatedFiles) {
			const expectedPath = join(temporarySourceRoot, file);
			const actualPath = resolve(app.root, "src", file);
			const label = relative(repositoryRoot, actualPath);
			if (!existsSync(expectedPath)) {
				if (existsSync(actualPath)) stale.push(`${label} (obsolete)`);
				continue;
			}
			if (!existsSync(actualPath)) {
				stale.push(`${label} (missing)`);
				continue;
			}
			const expected = comparableContent(file, readFileSync(expectedPath, "utf8"));
			const actual = comparableContent(file, readFileSync(actualPath, "utf8"));
			if (expected !== actual) stale.push(`${label} (differs)`);
		}

		if (stale.length > 0) {
			throw new Error(
				[
					`Generated artifacts are stale for ${app.name}.`,
					`Source input: ${app.source}`,
					"Stale files:",
					...stale.map((file) => `- ${file}`),
					`Refresh with: ${refreshCommand(app)}`,
				].join("\n"),
			);
		}
	} finally {
		rmSync(temporaryRoot, { recursive: true, force: true });
	}
};

try {
	for (const app of apps) checkApp(app);
	run("nub", ["run", "--filter", "playground", "editor:types:check"]);
	console.log("Generated Pandwind artifacts and playground declarations are fresh.");
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
