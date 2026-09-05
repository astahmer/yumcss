import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
	CodemodAdapterId,
	BuiltinHostFramework,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "pandwind-codemod/swap";

const keepArg = process.argv.indexOf("--keep");
const sandbox = resolve(
	keepArg === -1
		? mkdtempSync(join(tmpdir(), "pandwind-chakra-proof-"))
		: (process.argv[keepArg + 1] ?? mkdtempSync(join(tmpdir(), "pandwind-chakra-proof-"))),
);
const source = `import { css } from "styled-system/css";
const card = css({ padding: "1rem", color: "red" });
export const App = () => <div className={card} />;
`;
const result = runAdapterMigration(source, {
	from: CodemodAdapterId.Bamboo,
	to: CodemodAdapterId.ChakraUi,
	file: "App.tsx",
	mode: "safe",
	readFile: () => undefined,
	adapterRegistry: createBuiltinCodemodCatalog().registry,
	semantic: { source: { framework: BuiltinHostFramework.React } },
});
if (
	result.skipped !== 0 ||
	result.residuals.length !== 0 ||
	!result.code.includes("css={{") ||
	/className=\{\s*css\s*\(/u.test(result.code)
)
	throw new Error(`Chakra target carrier regression:\n${result.code}`);

mkdirSync(join(sandbox, "src"), { recursive: true });
writeFileSync(
	join(sandbox, "package.json"),
	`${JSON.stringify(
		{
			name: "pandwind-chakra-target-proof",
			private: true,
			type: "module",
			dependencies: { "@chakra-ui/react": "3.37.0", react: "19.2.8", "react-dom": "19.2.8" },
			devDependencies: { "@types/react": "19.2.8", typescript: "7.0.2" },
		},
		null,
		"\t",
	)}\n`,
);
writeFileSync(
	join(sandbox, "tsconfig.json"),
	`${JSON.stringify(
		{
			compilerOptions: {
				target: "ES2022",
				module: "ESNext",
				moduleResolution: "bundler",
				lib: ["ES2023", "DOM"],
				strict: true,
				jsx: "react-jsx",
				skipLibCheck: true,
				noEmit: true,
			},
			include: ["src"],
		},
		null,
		"\t",
	)}\n`,
);
writeFileSync(join(sandbox, "src/App.tsx"), result.code);
const install = spawnSync(
	"npm",
	["install", "--no-save", "--no-package-lock", "--ignore-scripts", "--loglevel=error"],
	{ cwd: sandbox, encoding: "utf8" },
);
if (install.status !== 0) throw new Error((install.stderr ?? "npm install failed").trim());
const typecheck = spawnSync(
	"nub",
	["exec", "tsc", "--noEmit", "-p", join(sandbox, "tsconfig.json")],
	{
		encoding: "utf8",
	},
);
if (typecheck.status !== 0)
	throw new Error((typecheck.stdout ?? typecheck.stderr ?? "tsc failed").trim());
console.log(`chakra-target-proof: passed (${sandbox})`);
if (keepArg === -1) rmSync(sandbox, { recursive: true, force: true });
