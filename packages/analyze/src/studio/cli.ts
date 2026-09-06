#!/usr/bin/env node
import cac, { type Command } from "cac";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createStudioCodemodEvaluator } from "./evaluator.ts";
import { createStudioServer } from "./server.ts";
import { createStudioSession } from "./session.ts";
import { createStaticStudioPreviewHost } from "./static-preview.ts";
import { createNodeStudioWorkspace } from "./workspace.ts";

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

const runStudio = async (root: string, shouldOpen: boolean): Promise<void> => {
	const workspace = createNodeStudioWorkspace();
	const evaluator = createStudioCodemodEvaluator();
	const session = createStudioSession({
		workspace,
		evaluation: evaluator,
		adapters: evaluator,
		preview: createStaticStudioPreviewHost(),
	});
	const server = await createStudioServer({ session });
	await session.open({ root });
	console.log(`Pandwind Studio: ${server.address.url}`);
	if (shouldOpen) openInBrowser(server.address.url);
	const close = async (): Promise<void> => {
		await server.close();
		process.exit(0);
	};
	process.once("SIGINT", () => void close());
	process.once("SIGTERM", () => void close());
};

const main = async (argv: readonly string[] = process.argv.slice(2)): Promise<void> => {
	const cli = cac("pandwind-studio");
	const command = cli.command("[root]", "Open the read-only Pandwind Studio for a project");
	command.option("--no-open", "Start the server without opening a browser");
	cli.help();
	try {
		cli.parse(["node", "pandwind-studio", ...argv], { run: false });
		if (cli.matchedCommand === undefined) return;
		validateCommand(cli.matchedCommand);
		const root = resolve(cli.args[0] ?? process.cwd());
		await runStudio(root, cli.options.open !== false);
	} catch (error) {
		console.error(`pandwind-studio: ${error instanceof Error ? error.message : String(error)}`);
		cli.outputHelp();
		process.exitCode = 1;
	}
};

if (process.argv[1]?.endsWith("studio/cli.ts") || process.argv[1]?.endsWith("studio/cli.js"))
	void main();

export { main as runStudioCli };
