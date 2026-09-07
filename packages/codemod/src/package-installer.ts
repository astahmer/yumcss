import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import {
	AdapterDependencyKindTag,
	type AdapterDependency,
	type AdapterDependencies,
} from "./swap/adapter-contract.ts";

const execFileAsync = promisify(execFile);

export const PackageManagerKindTag = {
	Pnpm: "pnpm",
	Npm: "npm",
	Yarn: "yarn",
	Bun: "bun",
} as const;

export type PackageManagerKind = (typeof PackageManagerKindTag)[keyof typeof PackageManagerKindTag];

const PACKAGE_MANAGERS: readonly PackageManagerKind[] = [
	PackageManagerKindTag.Pnpm,
	PackageManagerKindTag.Npm,
	PackageManagerKindTag.Yarn,
	PackageManagerKindTag.Bun,
];
const PACKAGE_MANAGER_SET = new Set(PACKAGE_MANAGERS);

export interface PackageInstallRequest {
	readonly root: string;
	readonly packageJson: Readonly<Record<string, unknown>>;
	readonly dependencies: readonly AdapterDependencies[];
}

export interface PackageInstallResult {
	readonly manager: PackageManagerKind;
	readonly installed: readonly string[];
	readonly alreadyPresent: readonly string[];
}

export interface PackageInstaller {
	install(request: PackageInstallRequest): Promise<PackageInstallResult>;
}

const dependencySections = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies",
] as const;

const declaredPackages = (packageJson: Readonly<Record<string, unknown>>): Set<string> =>
	new Set(
		dependencySections.flatMap((section) => {
			const value = packageJson[section];
			return value !== null && typeof value === "object"
				? Object.keys(value as Readonly<Record<string, unknown>>)
				: [];
		}),
	);

const packageSpec = (dependency: AdapterDependency): string => {
	if (dependency.range === undefined || dependency.range === "" || dependency.range === "*")
		return dependency.name;
	if (dependency.range.startsWith("workspace:")) return dependency.name;
	return `${dependency.name}@${dependency.range}`;
};

const managerFromPackageJson = (
	packageJson: Readonly<Record<string, unknown>>,
	root: string,
): PackageManagerKind => {
	const declared = packageJson.packageManager;
	if (typeof declared === "string") {
		const name = declared.split("@", 1)[0];
		if (PACKAGE_MANAGER_SET.has(name as PackageManagerKind)) return name as PackageManagerKind;
	}
	if (existsSync(`${root}/pnpm-lock.yaml`)) return PackageManagerKindTag.Pnpm;
	if (existsSync(`${root}/yarn.lock`)) return PackageManagerKindTag.Yarn;
	if (existsSync(`${root}/bun.lockb`) || existsSync(`${root}/bun.lock`))
		return PackageManagerKindTag.Bun;
	return PackageManagerKindTag.Npm;
};

const commandFor = (
	manager: PackageManagerKind,
	development: boolean,
): readonly [string, readonly string[]] => {
	switch (manager) {
		case PackageManagerKindTag.Pnpm:
			return ["pnpm", ["add", ...(development ? ["--save-dev"] : [])]];
		case PackageManagerKindTag.Yarn:
			return ["yarn", ["add", ...(development ? ["--dev"] : [])]];
		case PackageManagerKindTag.Bun:
			return ["bun", ["add", ...(development ? ["--dev"] : [])]];
		case PackageManagerKindTag.Npm:
			return ["npm", ["install", ...(development ? ["--save-dev"] : [])]];
	}
};

const isDevelopment = (kind: `${AdapterDependencyKindTag}`): boolean =>
	kind === AdapterDependencyKindTag.Development || kind === AdapterDependencyKindTag.Config;

export const createPackageInstaller = (
	run: (command: string, args: readonly string[], root: string) => Promise<void> = async (
		command,
		args,
		root,
	) => {
		await execFileAsync(command, [...args], { cwd: root });
	},
): PackageInstaller => ({
	async install(request) {
		const present = declaredPackages(request.packageJson);
		const byKind = new Map<boolean, Map<string, string>>([
			[false, new Map()],
			[true, new Map()],
		]);
		const alreadyPresent: string[] = [];
		for (const group of request.dependencies)
			for (const dependency of group.packages) {
				const development = isDevelopment(dependency.kind);
				if (present.has(dependency.name)) {
					alreadyPresent.push(dependency.name);
					continue;
				}
				byKind.get(development)!.set(dependency.name, packageSpec(dependency));
			}
		const manager = managerFromPackageJson(request.packageJson, request.root);
		const installed: string[] = [];
		for (const [development, packages] of byKind) {
			if (packages.size === 0) continue;
			const [command, baseArgs] = commandFor(manager, development);
			const specs = [...packages.values()].toSorted();
			await run(command, [...baseArgs, ...specs], request.root);
			installed.push(...specs);
		}
		return {
			manager,
			installed,
			alreadyPresent: [...new Set(alreadyPresent)].toSorted(),
		};
	},
});

export const PACKAGE_INSTALLER = createPackageInstaller();
