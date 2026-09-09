import { spawn } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import {
	MCP_EXECUTION_LANE,
	MCP_PROVENANCE_SOURCE,
	MCP_VALIDATION_CHECK,
	MCP_VALIDATION_STATUS,
	type McpValidationCheck,
} from "./contract.ts";
import type { McpValidationPort, McpValidationRequest, McpValidationResult } from "./tools.ts";

const NODE_VALIDATION_TIMEOUT_MS = 120_000;

const VALIDATION_SCRIPTS: Readonly<
	Record<Exclude<McpValidationCheck, "contract" | "canonical-css">, readonly string[]>
> = {
	[MCP_VALIDATION_CHECK.Typecheck]: ["typecheck", "type-check", "check:types"],
	[MCP_VALIDATION_CHECK.Build]: ["build"],
	[MCP_VALIDATION_CHECK.Ssr]: ["test:ssr", "ssr", "build:ssr", "test:server"],
	[MCP_VALIDATION_CHECK.Hydration]: ["test:hydration", "hydration", "test:hydration:ci"],
	[MCP_VALIDATION_CHECK.Browser]: ["test:browser", "test:e2e", "e2e"],
	[MCP_VALIDATION_CHECK.BundleSize]: ["test:size", "size", "size:check", "bundle-size"],
};

const PACKAGE_MANAGER_COMMAND = {
	pnpm: "pnpm",
	npm: "npm",
	yarn: "yarn",
	bun: "bun",
} as const;

type PackageManager = keyof typeof PACKAGE_MANAGER_COMMAND;

export interface NodeValidationHostOptions {
	/** Maximum time allowed for one declared package script. */
	readonly timeoutMs?: number;
}

interface PackageJson {
	readonly packageManager?: unknown;
	readonly scripts?: unknown;
}

interface ValidationWorkspace {
	readonly root: string;
	readonly cleanup: () => void;
}

interface ScriptRun {
	readonly command: string;
	readonly status: number | null;
	readonly signal: NodeJS.Signals | null;
	readonly timedOut: boolean;
	readonly spawnError?: Error;
}

function safeRelativePath(root: string, candidate: string): string {
	const normalized = candidate.replaceAll("\\", "/");
	if (normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized))
		throw new Error(`validation overlay path must be project-relative: ${candidate}`);
	if (normalized.split("/").includes(".."))
		throw new Error(`validation overlay path escapes the project root: ${candidate}`);
	const absolute = resolve(root, normalized);
	const outside = relative(root, absolute);
	if (outside === ".." || outside.startsWith("../"))
		throw new Error(`validation overlay path escapes the project root: ${candidate}`);
	return absolute;
}

function readPackageJson(root: string): PackageJson {
	const value: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	if (typeof value !== "object" || value === null || Array.isArray(value))
		throw new Error("package.json must contain an object");
	return value as PackageJson;
}

function packageScripts(packageJson: PackageJson): Readonly<Record<string, string>> {
	if (typeof packageJson.scripts !== "object" || packageJson.scripts === null) return {};
	return Object.fromEntries(
		Object.entries(packageJson.scripts as Record<string, unknown>).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string",
		),
	);
}

function detectPackageManager(root: string, packageJson: PackageJson): PackageManager {
	if (typeof packageJson.packageManager === "string") {
		const [name] = packageJson.packageManager.split("@", 1);
		if (name !== undefined && name in PACKAGE_MANAGER_COMMAND) return name as PackageManager;
	}
	if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
	if (existsSync(join(root, "yarn.lock"))) return "yarn";
	if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return "bun";
	return "npm";
}

function copyProject(root: string): ValidationWorkspace {
	if (!existsSync(join(root, "package.json")))
		throw new Error("project validation requires a package.json at the project root");
	const isolatedRoot = mkdtempSync(join(tmpdir(), "pandwind-mcp-validation-"));
	try {
		cpSync(root, isolatedRoot, {
			recursive: true,
			filter: (source) => {
				const path = relative(root, source).replaceAll("\\", "/");
				return (
					path !== ".git" && !path.startsWith(".git/") && !path.split("/").includes("node_modules")
				);
			},
		});
		const sourceNodeModules = join(root, "node_modules");
		const targetNodeModules = join(isolatedRoot, "node_modules");
		if (existsSync(sourceNodeModules)) symlinkSync(sourceNodeModules, targetNodeModules, "dir");
		return {
			root: isolatedRoot,
			cleanup: () => rmSync(isolatedRoot, { recursive: true, force: true }),
		};
	} catch (error) {
		rmSync(isolatedRoot, { recursive: true, force: true });
		throw error;
	}
}

function writeOverlayFile(root: string, path: string, content: string): void {
	const absolute = safeRelativePath(root, path);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, content);
}

function applyOverlay(root: string, request: McpValidationRequest): void {
	for (const file of request.files) {
		safeRelativePath(root, file.outputFile);
		if (file.removeSource && file.outputFile !== file.file) {
			const source = safeRelativePath(root, file.file);
			if (existsSync(source)) unlinkSync(source);
		}
		writeOverlayFile(root, file.outputFile, file.code);
		for (const generated of file.generatedFiles)
			writeOverlayFile(root, generated.path, generated.content);
		for (const change of file.fileChanges) {
			const path = safeRelativePath(root, change.path);
			if (change.expectedContent !== undefined && existsSync(path)) {
				const current = readFileSync(path, "utf8");
				if (current !== change.expectedContent && current !== change.content)
					throw new Error(`shared file changed while preparing validation: ${change.path}`);
			}
			writeOverlayFile(root, change.path, change.content);
		}
	}
}

function runScript(
	root: string,
	manager: PackageManager,
	script: string,
	timeoutMs: number,
): Promise<ScriptRun> {
	const command = `${PACKAGE_MANAGER_COMMAND[manager]} run ${script}`;
	return new Promise((resolveRun) => {
		const child = spawn(PACKAGE_MANAGER_COMMAND[manager], ["run", script], {
			cwd: root,
			env: { ...process.env, CI: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let settled = false;
		let timedOut = false;
		child.stdout?.on("data", () => undefined);
		child.stderr?.on("data", () => undefined);
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
		}, timeoutMs);
		const finish = (run: ScriptRun): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolveRun(run);
		};
		child.once("error", (error) =>
			finish({ command, status: null, signal: null, timedOut, spawnError: error }),
		);
		child.once("close", (status, signal) => finish({ command, status, signal, timedOut }));
	});
}

function scriptFor(
	check: Exclude<McpValidationCheck, "contract" | "canonical-css">,
	scripts: Readonly<Record<string, string>>,
): string | undefined {
	return VALIDATION_SCRIPTS[check].find((candidate) => scripts[candidate] !== undefined);
}

function resultFor(
	check: McpValidationCheck,
	status: (typeof MCP_VALIDATION_STATUS)[keyof typeof MCP_VALIDATION_STATUS],
	detail: string,
	command?: string,
): McpValidationResult {
	return {
		check,
		status,
		executionLane: MCP_EXECUTION_LANE.HostProject,
		detail,
		...(command === undefined ? {} : { commandsExecuted: [command] }),
		provenance: {
			source: MCP_PROVENANCE_SOURCE.Host,
			host: "node-package-scripts",
			evidence: ["temporary project overlay", "declared package script"],
		},
	};
}

export function createNodeMcpValidationPort(
	options: NodeValidationHostOptions = {},
): McpValidationPort {
	const timeoutMs = options.timeoutMs ?? NODE_VALIDATION_TIMEOUT_MS;
	return {
		async run(request) {
			const workspace = copyProject(request.root);
			try {
				applyOverlay(workspace.root, request);
				const packageJson = readPackageJson(workspace.root);
				const scripts = packageScripts(packageJson);
				const manager = detectPackageManager(workspace.root, packageJson);
				const results: McpValidationResult[] = [];
				for (const check of request.checks) {
					if (!(check in VALIDATION_SCRIPTS)) {
						results.push(
							resultFor(
								check,
								MCP_VALIDATION_STATUS.NotApplicable,
								`${check} is an in-process validation and is not a package script check`,
							),
						);
						continue;
					}
					const script = scriptFor(
						check as Exclude<McpValidationCheck, "contract" | "canonical-css">,
						scripts,
					);
					if (script === undefined) {
						results.push(
							resultFor(
								check,
								MCP_VALIDATION_STATUS.Unavailable,
								`package.json has no supported validation script for ${check}`,
							),
						);
						continue;
					}
					const run = await runScript(workspace.root, manager, script, timeoutMs);
					const command = run.command;
					if (run.spawnError !== undefined) {
						results.push(
							resultFor(
								check,
								MCP_VALIDATION_STATUS.Unavailable,
								`could not start ${command}: ${run.spawnError.message}`,
								command,
							),
						);
						continue;
					}
					if (run.timedOut) {
						results.push(
							resultFor(
								check,
								MCP_VALIDATION_STATUS.Failed,
								`${command} exceeded ${timeoutMs}ms`,
								command,
							),
						);
						continue;
					}
					if (run.status === 0) {
						results.push(
							resultFor(check, MCP_VALIDATION_STATUS.Passed, `${command} passed`, command),
						);
						continue;
					}
					results.push(
						resultFor(
							check,
							MCP_VALIDATION_STATUS.Failed,
							`${command} failed with ${run.signal === null ? `exit code ${String(run.status)}` : run.signal}`,
							command,
						),
					);
				}
				return results;
			} finally {
				workspace.cleanup();
			}
		},
	};
}
