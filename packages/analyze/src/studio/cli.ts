#!/usr/bin/env node
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

const main = async (argv: readonly string[]): Promise<void> => {
	const root = resolve(argv.find((argument) => !argument.startsWith("-")) ?? process.cwd());
	const shouldOpen = !argv.includes("--no-open");
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

if (process.argv[1]?.endsWith("studio/cli.ts") || process.argv[1]?.endsWith("studio/cli.js"))
	void main(process.argv.slice(2));

export { main as runStudioCli };
