#!/usr/bin/env node
import { cac, type Command } from "cac";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createMigrationPreviewCodemodEvaluator } from "./evaluator.ts";
import { createMigrationPreviewServer } from "./server.ts";
import { createMigrationPreviewSession } from "./session.ts";
import { createStaticMigrationPreviewHost } from "./static-preview.ts";
import { createMigrationPreviewWorkspace } from "./workspace.ts";

const openInBrowser = (url: string): void => {
	const command =
		process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	spawn(command, [url], {
		detached: true,
		stdio: "ignore",
		shell: process.platform === "win32",
	}).unref();
};

const validateCommand = (command: Command): void => {
	command.checkUnknownOptions();
	command.checkOptionValue();
	command.checkRequiredArgs();
	command.checkUnusedArgs();
};

const runMigrationPreview = async (root: string, shouldOpen: boolean): Promise<void> => {
	const workspace = createMigrationPreviewWorkspace();
	const evaluator = createMigrationPreviewCodemodEvaluator();
	const session = createMigrationPreviewSession({
		workspace,
		evaluation: evaluator,
		adapters: evaluator,
		preview: createStaticMigrationPreviewHost(),
	});
	const server = await createMigrationPreviewServer({ session });
	await session.open({ root });
	console.log(`YumCSS Migration Preview: ${server.address.url}`);
	if (shouldOpen) openInBrowser(server.address.url);
	const close = async (): Promise<void> => {
		await server.close();
		process.exit(0);
	};
	process.once("SIGINT", () => void close());
	process.once("SIGTERM", () => void close());
};

const main = async (argv: readonly string[] = process.argv.slice(2)): Promise<void> => {
	const cli = cac("yumcss-migration-preview");
	const command = cli.command("[root]", "Preview a project migration without changing its files");
	command.option("--no-open", "Start the server without opening a browser");
	cli.help();
	try {
		cli.parse(["node", "yumcss-migration-preview", ...argv], { run: false });
		if (cli.matchedCommand === undefined) return;
		validateCommand(cli.matchedCommand);
		const root = resolve(cli.args[0] ?? process.cwd());
		await runMigrationPreview(root, cli.options.open !== false);
	} catch (error) {
		console.error(
			`yumcss migration preview: ${error instanceof Error ? error.message : String(error)}`,
		);
		cli.outputHelp();
		process.exitCode = 1;
	}
};

if (
	process.argv[1]?.endsWith("migration-preview/cli.ts") ||
	process.argv[1]?.endsWith("migration-preview/cli.js")
)
	void main();

export { main as runMigrationPreviewCli };
