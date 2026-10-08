import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "@pandacss/config";
import { Generator } from "@pandacss/generator";
import presetBase from "@pandacss/preset-base";
import presetPanda from "@pandacss/preset-panda";
import { examplePreset } from "@yumcss/example-preset";

const directory = new URL("../src/generated/panda/", import.meta.url);
const functionReferences = new Map();
/* oxlint-disable antislop/no-runtime-typeof -- Serialization boundary for official config values: functions retain imported identity, objects recurse, and primitives use JSON. */
const indexFunctions = (value, expression) => {
	if (typeof value === "function") {
		functionReferences.set(value, expression);
		return;
	}
	if (value === null || typeof value !== "object") return;
	for (const [key, child] of Object.entries(value))
		indexFunctions(child, `${expression}[${JSON.stringify(key)}]`);
};
indexFunctions(presetBase, "presetBase");
indexFunctions(presetPanda, "presetPanda");
// Keep upstream closures intact: reference imported preset functions instead
// of serializing their source and losing their lexical environment.
const sourceFor = (value) => {
	if (typeof value === "function") {
		const reference = functionReferences.get(value);
		if (reference === undefined) throw new Error("Panda config contains an unowned function");
		return reference;
	}
	if (value instanceof RegExp)
		return `new RegExp(${JSON.stringify(value.source)}, ${JSON.stringify(value.flags)})`;
	if (Array.isArray(value)) return `[${value.map(sourceFor).join(",")} ]`;
	if (value !== null && typeof value === "object")
		return `{${Object.entries(value)
			.map(([key, child]) => `${JSON.stringify(key)}:${sourceFor(child)}`)
			.join(",")}}`;
	return JSON.stringify(value) ?? "undefined";
};
/* oxlint-enable antislop/no-runtime-typeof */
const utilityValues = {};
for (const [property, binding] of Object.entries(examplePreset.properties)) {
	// oxlint-disable-next-line antislop/no-runtime-typeof -- Property bindings are an external union: only object bindings carry the scalar utility values serialized below.
	if (binding === null || typeof binding !== "object") continue;
	const values =
		typeof binding.$tokens === "string" ? examplePreset.tokens[binding.$tokens] : binding;
	const scalars = Object.fromEntries(
		Object.entries(values).filter(
			([key, value]) =>
				!key.startsWith("$tokens") && (typeof value === "string" || typeof value === "number"),
		),
	);
	utilityValues[property] = { values: scalars };
}
const conditions = Object.fromEntries(
	Object.entries(examplePreset.conditions).map(([key, value]) => [key.replace(/^_/, ""), value]),
);
const resolved = await resolveConfig(
	{
		config: {
			outdir: "styled-system",
			presets: [presetBase, presetPanda],
			conditions: { extend: conditions },
			utilities: { extend: utilityValues },
		},
		dependencies: [],
		path: fileURLToPath(new URL("./playground-panda.config.ts", import.meta.url)),
	},
	fileURLToPath(new URL("../", import.meta.url)),
);
const generator = new Generator(resolved);
const banner =
	"// Generated from the official Panda 1.12.1 config/generator.\n// Regenerate with pnpm --filter playground run panda:metadata.\n";
const outputs = new Map();
outputs.set(
	"config.mjs",
	banner +
		'import presetBase from "@pandacss/preset-base";\nimport presetPanda from "@pandacss/preset-panda";\nexport const pandaConfig = ' +
		sourceFor({ ...resolved.config, presets: [] }) +
		";\n",
);
outputs.set(
	"config.d.mts",
	banner +
		'import type { Context } from "@pandacss/core";\nexport declare const pandaConfig: ConstructorParameters<typeof Context>[0]["config"];\n',
);

for (const artifact of generator.getArtifacts(["helpers", "css-fn"])) {
	for (const file of artifact.files) {
		if (!file.file.endsWith(".mjs") || file.code === undefined) continue;
		outputs.set(
			(artifact.id === "helpers" ? "" : "css/") + file.file,
			banner + file.code.replace(/^[\t ]+$/gm, ""),
		);
	}
}
for (const [path, content] of outputs) {
	const output = new URL(path, directory);
	if (process.argv.includes("--check")) {
		if (readFileSync(output, "utf8") !== content)
			throw new Error("Panda artifacts are stale; run pnpm --filter playground run panda:metadata");
	} else {
		mkdirSync(new URL("./", output), { recursive: true });
		writeFileSync(output, content);
	}
}
