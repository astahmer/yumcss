#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { cac, type Command } from "cac";
import { createCompilerPreviewServer } from "./server.ts";

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

const runCompilerPreview = async (
	root: string,
	configFile: string | undefined,
	shouldOpen: boolean,
): Promise<void> => {
	const originalWorkingDirectory = process.cwd();
	process.chdir(root);
	let server: Awaited<ReturnType<typeof createCompilerPreviewServer>>;
	try {
		server = await createCompilerPreviewServer({
			root,
			...(configFile === undefined ? {} : { configFile }),
		});
	} catch (error) {
		process.chdir(originalWorkingDirectory);
		throw error;
	}
	console.log(`Pandwind Compiler Preview: ${server.address.url}`);
	if (shouldOpen) openInBrowser(server.address.url);
	let closing = false;
	const close = async (): Promise<void> => {
		if (closing) return;
		closing = true;
		try {
			await server.close();
		} finally {
			process.chdir(originalWorkingDirectory);
			process.exit(0);
		}
	};
	process.once("SIGINT", () => void close());
	process.once("SIGTERM", () => void close());
};

const main = async (argv: readonly string[] = process.argv.slice(2)): Promise<void> => {
	const cli = cac("pandwind-compiler-preview");
	const command = cli.command(
		"[root]",
		"Preview Vite-transformed source without writing project files",
	);
	command.option(
		"--config <path>",
		"Override Vite config discovery with a path relative to the project root",
	);
	command.option("--no-open", "Start the server without opening a browser");
	cli.help();
	try {
		cli.parse(["node", "pandwind-compiler-preview", ...argv], { run: false });
		if (cli.matchedCommand === undefined) return;
		validateCommand(cli.matchedCommand);
		const root = resolve(cli.args[0] ?? process.cwd());
		const configFile =
			typeof cli.options.config === "string" ? resolve(root, cli.options.config) : undefined;
		await runCompilerPreview(root, configFile, cli.options.open !== false);
	} catch (error) {
		console.error(
			`pandwind compiler preview: ${error instanceof Error ? error.message : String(error)}`,
		);
		cli.outputHelp();
		process.exitCode = 1;
	}
};

void main();
