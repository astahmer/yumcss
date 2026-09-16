import { createCss } from "pandwind/css";
import { createNamedAtomsStrategy } from "pandwind/css/named-atoms-strategy";
import type { ClassNameStrategy } from "pandwind/css/class-name-strategy";
import { createPandaAdapter } from "pandwind/css/panda";
import { createStyleXAdapter } from "pandwind/css/stylex";
import { createUnoCssAdapter } from "pandwind/css/unocss";
import { examplePreset } from "@pandwind/example-preset";

const custom: ClassNameStrategy = {
	name: "benchmark",
	toClassName: (key, value) => `benchmark-${key}-${value}`,
};
const strategies = [
	custom,
	createNamedAtomsStrategy("bench"),
	createPandaAdapter({ conditions: examplePreset.conditions }),
	createStyleXAdapter({ conditions: examplePreset.conditions }),
	createUnoCssAdapter({ preset: examplePreset }),
];
const outputs = strategies.map((className) =>
	createCss(examplePreset, { className }).class({ color: "$blue-500", padding: 4 }),
);

export const workload = { outputs, strategies };
