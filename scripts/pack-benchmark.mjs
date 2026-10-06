import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = join(repositoryRoot, "packages/yumcss");
const sourceRevision = process.argv[2];
if (!/^[\da-f]{8,40}$/iu.test(sourceRevision ?? "")) {
	throw new Error("Usage: node scripts/pack-benchmark.mjs <yumcss-revision> [output-directory]");
}
const revision = sourceRevision.slice(0, 8);
const outputDirectory = resolve(process.argv[3] ?? ".");
const releaseFiles = ["dist", "README.md", "LICENSE"];
const benchmarkPackages = [
	{ filename: `yumcss-0.1.0-${revision}.tgz`, files: releaseFiles },
	{
		filename: `yumcss-0.1.0-${revision}-buildtime.tgz`,
		files: [...releaseFiles, "src"],
	},
];

mkdirSync(outputDirectory, { recursive: true });

for (const benchmarkPackage of benchmarkPackages) {
	const packDirectory = mkdtempSync(join(tmpdir(), "yumcss-benchmark-pack-"));

	try {
		const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
		manifest.version = "0.1.0";
		manifest.files = benchmarkPackage.files;
		writeFileSync(join(packDirectory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);

		for (const file of benchmarkPackage.files) {
			cpSync(join(packageRoot, file), join(packDirectory, file), { recursive: true });
		}

		execFileSync(
			"pnpm",
			["pack", "--ignore-workspace", "--out", join(outputDirectory, benchmarkPackage.filename)],
			{ cwd: packDirectory, stdio: "inherit" },
		);
	} finally {
		rmSync(packDirectory, { recursive: true, force: true });
	}
}
