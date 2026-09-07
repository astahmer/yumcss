import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const packageRoot = join(root, "packages");
const inventoryPath = join(root, "plans/evidence/package-surface.json");
const buildDependencies = new Set([
	"@tailwindcss/node",
	"cac",
	"oxc-parser",
	"postcss",
	"unplugin",
]);

interface PackageManifest {
	readonly name: string;
	readonly repository?: { readonly directory?: string };
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly exports?: Readonly<Record<string, unknown>>;
}

interface SurfaceRecord {
	readonly packageName: string;
	readonly exportPaths: readonly string[];
	readonly owner: "runtime" | "build" | "integration" | "tooling" | "test";
	readonly maturity: "stable" | "experimental" | "research";
	readonly dependencies: readonly string[];
	readonly externalContract: boolean;
	readonly evidence: readonly string[];
	readonly note: string;
}

interface SurfaceInventory {
	readonly schema: "pandwind.package-surface/1";
	readonly records: readonly SurfaceRecord[];
}

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

const inventory = readJson<SurfaceInventory>(inventoryPath);
if (inventory.schema !== "pandwind.package-surface/1") {
	throw new Error(`unsupported package surface schema in ${inventoryPath}`);
}

const manifests = readdirSync(packageRoot, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => {
		const directory = join(packageRoot, entry.name);
		return {
			directory,
			manifest: readJson<PackageManifest>(join(directory, "package.json")),
		};
	});

const expected = new Map<string, { packageName: string; exportPath: string }>();
const failures: string[] = [];

for (const { directory, manifest } of manifests) {
	const packageDirectory = relative(root, directory).replaceAll("\\", "/");
	if (manifest.repository?.directory !== packageDirectory) {
		failures.push(
			`${manifest.name}: repository.directory should be ${JSON.stringify(packageDirectory)}, got ${JSON.stringify(manifest.repository?.directory)}`,
		);
	}
	for (const exportPath of Object.keys(manifest.exports ?? {})) {
		const key = `${manifest.name}:${exportPath}`;
		expected.set(key, { packageName: manifest.name, exportPath });
	}
	if (manifest.name === "pandwind") {
		for (const dependency of buildDependencies) {
			if (dependency in (manifest.dependencies ?? {})) {
				failures.push(`pandwind: build dependency ${dependency} leaked into runtime dependencies`);
			}
		}
	}
}

const covered = new Map<string, SurfaceRecord>();
for (const record of inventory.records) {
	if (record.exportPaths.length === 0) failures.push(`${record.packageName}: empty surface record`);
	if (record.evidence.length === 0)
		failures.push(`${record.packageName}: ${record.exportPaths.join(", ")}: no evidence`);
	if (record.note.trim() === "")
		failures.push(`${record.packageName}: ${record.exportPaths.join(", ")}: no ownership note`);
	for (const evidence of record.evidence) {
		if (!readFileExists(join(root, evidence)))
			failures.push(`${record.packageName}: missing evidence ${evidence}`);
	}
	for (const exportPath of record.exportPaths) {
		const key = `${record.packageName}:${exportPath}`;
		if (!expected.has(key)) failures.push(`inventory lists unpublished export ${key}`);
		if (covered.has(key)) failures.push(`inventory lists ${key} more than once`);
		covered.set(key, record);
		if (exportPath.startsWith("./_runtime/") && record.externalContract) {
			failures.push(`${key}: generated runtime entry must be internal`);
		}
	}
}

for (const key of expected.keys()) {
	if (!covered.has(key)) failures.push(`published export has no inventory record: ${key}`);
}

function readFileExists(path: string): boolean {
	try {
		readFileSync(path);
		return true;
	} catch {
		return false;
	}
}

if (failures.length > 0) {
	console.error(
		["Package surface check failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"),
	);
	process.exitCode = 1;
} else {
	console.log(
		`Package surface is covered: ${expected.size} exports across ${manifests.length} packages.`,
	);
}
