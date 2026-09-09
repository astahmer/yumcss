import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const rootPackagePath = join(root, "package.json");
const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8"));
const expectedPackageManager = "pnpm@12.3.4";

if (rootPackage.packageManager !== expectedPackageManager) {
	throw new Error(
		`package.json must declare ${expectedPackageManager}; found ${String(rootPackage.packageManager)}`,
	);
}

const userAgent = process.env.npm_config_user_agent ?? process.env.NPM_CONFIG_USER_AGENT;
const actualVersion = userAgent?.match(/(?:^|\s)pnpm\/([^\s]+)/)?.[1];

if (actualVersion && actualVersion !== "12.3.4") {
	throw new Error(
		`This workspace requires pnpm 12.3.4; the active package manager is pnpm ${actualVersion}`,
	);
}

const workspacePackagePaths = [rootPackagePath];
for (const workspaceRoot of ["apps", "examples", "packages"]) {
	const directory = join(root, workspaceRoot);
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			workspacePackagePaths.push(join(directory, entry.name, "package.json"));
		}
	}
}
workspacePackagePaths.push(join(root, "docs", "package.json"));

const conflictingPackages = workspacePackagePaths.flatMap((packagePath) => {
	try {
		const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
		if (packagePath !== rootPackagePath && packageJson.packageManager) {
			return [
				`${relative(root, packagePath)} declares ${String(packageJson.packageManager)}; the workspace pin belongs at the root`,
			];
		}
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	return [];
});

if (conflictingPackages.length > 0) {
	throw new Error(conflictingPackages.join("\n"));
}

console.log(`pnpm ${expectedPackageManager.slice("pnpm@".length)} is configured for the workspace`);
