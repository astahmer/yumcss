import { describe, expect, test } from "vitest";
import { resolve } from "node:path";
import { createPackageInstaller, PackageManagerKindTag } from "../src/package-installer.ts";
import { AdapterDependencyKindTag } from "../src/swap/adapter-contract.ts";

describe("package installer", () => {
	test("deduplicates target dependencies and installs runtime and development groups", async () => {
		const calls: Array<{ command: string; args: readonly string[]; root: string }> = [];
		const installer = createPackageInstaller(async (command, args, root) => {
			calls.push({ command, args, root });
		});
		const result = await installer.install({
			root: "/project",
			packageJson: {
				packageManager: "pnpm@12.3.4",
				dependencies: { pandwind: "workspace:*" },
			},
			dependencies: [
				{
					packages: [
						{ name: "pandwind", kind: AdapterDependencyKindTag.Runtime },
						{ name: "styled-components", kind: AdapterDependencyKindTag.Peer },
					],
				},
				{
					packages: [
						{ name: "@types/styled-components", kind: AdapterDependencyKindTag.Development },
						{ name: "styled-components", kind: AdapterDependencyKindTag.Peer },
					],
				},
			],
		});

		expect(result.manager).toBe(PackageManagerKindTag.Pnpm);
		expect(result.alreadyPresent).toEqual(["pandwind"]);
		expect(result.installed).toEqual(["styled-components", "@types/styled-components"]);
		expect(calls).toEqual([
			{
				command: "pnpm",
				args: ["add", "styled-components"],
				root: "/project",
			},
			{
				command: "pnpm",
				args: ["add", "--save-dev", "@types/styled-components"],
				root: "/project",
			},
		]);
	});

	test("uses the package manager lockfile when packageManager is absent", async () => {
		const calls: Array<{ command: string; args: readonly string[] }> = [];
		const installer = createPackageInstaller(async (command, args) => {
			calls.push({ command, args });
		});
		const result = await installer.install({
			root: resolve(import.meta.dirname, "../../.."),
			packageJson: {},
			dependencies: [
				{
					packages: [{ name: "@chakra-ui/react", kind: AdapterDependencyKindTag.Peer }],
				},
			],
		});

		expect(result.manager).toBe(PackageManagerKindTag.Pnpm);
		expect(calls).toEqual([{ command: "pnpm", args: ["add", "@chakra-ui/react"] }]);
	});
});
