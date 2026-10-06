import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const packages = ["yumcss", "codemod", "analyze", "devtools", "lint-plugin"];
const required = ["name", "version", "license", "repository", "files", "publishConfig", "engines"];
const failures = [];

for (const directory of packages) {
	const packageDir = join(root, "packages", directory);
	const manifestPath = join(packageDir, "package.json");
	if (!existsSync(manifestPath)) {
		failures.push(`${directory}: missing package.json`);
		continue;
	}
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	if (manifest.private === true) failures.push(`${manifest.name}: package is private`);
	for (const key of required) {
		if (manifest[key] === undefined || manifest[key] === null)
			failures.push(`${manifest.name}: missing ${key}`);
	}
	for (const file of manifest.files ?? []) {
		if (file === "README.md" || file === "LICENSE") {
			if (!existsSync(join(packageDir, file))) failures.push(`${manifest.name}: missing ${file}`);
		}
	}
	if (manifest.publishConfig?.access !== "public")
		failures.push(`${manifest.name}: publishConfig.access must be public`);
	if (manifest.publishConfig?.provenance !== true)
		failures.push(`${manifest.name}: provenance must be enabled`);
}

if (failures.length > 0) {
	console.error("release preflight failed:");
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exitCode = 1;
} else {
	console.log(`release preflight: ${packages.length} packages publishable`);
}
