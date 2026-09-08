import { describe, expect, test } from "vitest";
import { TwCommand, createTwCli, parseTwCommand, type TwCliHandlers } from "../src/tw/cli.ts";

const cwd = "/fixture/project";

describe("pandwind-codemod tw command router", () => {
	test("parses the complete generate command", () => {
		const command = parseTwCommand(
			[
				TwCommand.Generate,
				"config/tailwind.css",
				"generated",
				"--tokens",
				"./preset.ts",
				"--agents",
				"--bridge",
				"--bridge-file",
				"generated/tw-bridge.ts",
				"--preset-import",
				"@acme/design-system",
				"--preset-export",
				"preset",
			],
			cwd,
		);

		expect(command).toMatchInlineSnapshot(`
			{
			  "agents": true,
			  "bridge": true,
			  "bridgeFile": "/fixture/project/generated/tw-bridge.ts",
			  "command": "generate",
			  "cssEntry": "/fixture/project/config/tailwind.css",
			  "cwd": "/fixture/project",
			  "outDir": "/fixture/project/generated",
			  "presetExport": "preset",
			  "presetImport": "@acme/design-system",
			  "tokensModule": "./preset.ts",
			}
		`);
		expect(command.command).toBe(TwCommand.Generate);
		if (command.command === TwCommand.Generate) {
			expect(command.bridge).toBe(true);
			expect(command.tokensModule).toBe("./preset.ts");
		}
	});

	test("uses stable defaults for scan and prune", () => {
		const scan = parseTwCommand([TwCommand.Scan], cwd);
		const prune = parseTwCommand([TwCommand.Prune], cwd);

		expect({ scan, prune }).toMatchInlineSnapshot(`
			{
			  "prune": {
			    "base": "/fixture/project",
			    "command": "prune",
			    "srcDir": "/fixture/project/src",
			    "themeCss": "/fixture/project/src/pandwind-theme.css",
			    "twEntry": "/fixture/project/src/tw.ts",
			  },
			  "scan": {
			    "command": "scan",
			    "outFile": "/fixture/project/src/pandwind.safelist.css",
			    "srcDir": "/fixture/project/src",
			    "twEntry": "/fixture/project/src/tw.ts",
			  },
			}
		`);
		expect(scan.command).toBe(TwCommand.Scan);
		expect(prune.command).toBe(TwCommand.Prune);
		const manifest = parseTwCommand([TwCommand.Manifest], cwd);
		expect(manifest).toEqual({
			command: TwCommand.Manifest,
			outDir: "/fixture/project/src",
			inputFiles: ["/fixture/project/src/tailwind.css"],
			cwd,
		});
	});

	test("dispatches only through injected stage handlers", async () => {
		const calls: string[] = [];
		const handlers: TwCliHandlers = {
			async generate(command) {
				calls.push(`generate:${command.cssEntry}`);
			},
			async scan(command) {
				calls.push(`scan:${command.outFile}`);
			},
			async prune(command) {
				calls.push(`prune:${command.themeCss}`);
			},
			async manifest(command) {
				calls.push(`manifest:${command.outDir}`);
			},
		};

		const cli = createTwCli(handlers, cwd);
		await cli.run([TwCommand.Generate, "input.css", "out"]);
		await cli.run([TwCommand.Scan, "tw.ts", "src", "safe.ts"]);
		await cli.run([TwCommand.Prune, "theme.css", "tw.ts", "src"]);
		await cli.run([TwCommand.Manifest, "src", "input.css"]);

		expect(calls).toMatchInlineSnapshot(`
			[
			  "generate:/fixture/project/input.css",
			  "scan:/fixture/project/safe.ts",
			  "prune:/fixture/project/theme.css",
			  "manifest:/fixture/project/src",
			]
		`);
		expect(calls).toHaveLength(4);
	});

	test("fails closed for malformed command lines", () => {
		expect(() => parseTwCommand(["unknown"], cwd)).toThrow(
			"pandwind-codemod tw: unknown command 'unknown'",
		);
		expect(() => parseTwCommand([TwCommand.Generate, "--tokens"], cwd)).toThrow(
			"option `--tokens <module>` value is missing",
		);
		expect(() => parseTwCommand([TwCommand.Scan, "--agents"], cwd)).toThrow(
			"Unknown option `--agents`",
		);
		expect(() => parseTwCommand([TwCommand.Generate, "--unknown"], cwd)).toThrow(
			"Unknown option `--unknown`",
		);
	});
});
