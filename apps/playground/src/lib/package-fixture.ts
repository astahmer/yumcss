import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	PLAYGROUND_EXECUTION_LANE,
	PLAYGROUND_EXECUTION_SCOPE,
	PLAYGROUND_EVIDENCE_CHECK,
} from "./eval-playground.ts";

export interface PackageFixtureProof {
	readonly lane: typeof PLAYGROUND_EXECUTION_LANE.PackageFixture;
	readonly scope: typeof PLAYGROUND_EXECUTION_SCOPE.ProjectPackage;
	readonly verified: readonly string[];
	readonly unavailable: readonly string[];
	readonly note: string;
}

const fixtureRoot = resolve(import.meta.dirname, "../../fixtures/package-fixture");

const filesUnder = (directory: string): string[] => {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? filesUnder(path) : [path];
	});
};

const run = (
	fixture: string,
	outputDirectory: string,
	args: readonly string[],
	extraEnv: Readonly<Record<string, string>> = {},
): void => {
	try {
		execFileSync("pnpm", ["exec", ...args], {
			cwd: fixture,
			env: { ...process.env, PANDWIND_FIXTURE_OUT_DIR: outputDirectory, ...extraEnv },
			stdio: "pipe",
		});
	} catch (error) {
		const details = error as { stderr?: Buffer | string; stdout?: Buffer | string };
		const output = [details.stdout, details.stderr]
			.filter((value): value is Buffer | string => value !== undefined)
			.map((value) => value.toString())
			.join("\n")
			.trim();
		throw new Error(`${args.join(" ")} failed${output === "" ? "" : `:\n${output}`}`, {
			cause: error,
		});
	}
};

export const runPackageFixtureProof = (): PackageFixtureProof => {
	const typecheckOutput = resolve(fixtureRoot, ".proof-typecheck");
	const clientOutput = resolve(fixtureRoot, ".proof-client");
	const ssrOutput = resolve(fixtureRoot, ".proof-ssr");
	try {
		run(fixtureRoot, typecheckOutput, ["tsc", "--noEmit", "-p", "tsconfig.json"]);
		run(fixtureRoot, clientOutput, ["vite", "build", "--config", "vite.config.ts"]);
		const clientCss = filesUnder(clientOutput)
			.filter((path) => path.endsWith(".css"))
			.map((path) => readFileSync(path, "utf8"))
			.join("\n");
		if (!clientCss.includes("background-color") || !clientCss.includes("padding")) {
			throw new Error("client build did not emit the extracted Pandwind CSS");
		}
		run(fixtureRoot, ssrOutput, [
			"vite",
			"build",
			"--config",
			"vite.config.ts",
			"--ssr",
			"src/entry-server.tsx",
		]);
		if (filesUnder(ssrOutput).filter((path) => path.endsWith(".js")).length === 0) {
			throw new Error("SSR build did not emit a server bundle");
		}
		run(fixtureRoot, clientOutput, ["node", "test/e2e.mjs"], {
			PANDWIND_FIXTURE_SSR_OUT_DIR: ssrOutput,
		});
		return {
			lane: PLAYGROUND_EXECUTION_LANE.PackageFixture,
			scope: PLAYGROUND_EXECUTION_SCOPE.ProjectPackage,
			verified: [
				PLAYGROUND_EVIDENCE_CHECK.ProjectTypecheck,
				PLAYGROUND_EVIDENCE_CHECK.ProjectBuild,
				PLAYGROUND_EVIDENCE_CHECK.SsrBuild,
				PLAYGROUND_EVIDENCE_CHECK.BrowserHost,
				PLAYGROUND_EVIDENCE_CHECK.Hydration,
			],
			unavailable: [],
			note: "This proof imports the fixture through package names, typechecks it, builds client and SSR bundles, then hydrates the server-rendered client in Chromium and verifies its click handler.",
		};
	} finally {
		for (const directory of [typecheckOutput, clientOutput, ssrOutput]) {
			rmSync(directory, { recursive: true, force: true });
		}
	}
};
