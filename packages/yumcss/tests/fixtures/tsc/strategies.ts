import { createCss } from "yumcss/css";
import { createNamedAtomsStrategy } from "yumcss/css/named";
import type { ClassNameStrategy } from "yumcss/css";
import { createPandaAdapter } from "yumcss/css/panda";
import { createStyleXAdapter } from "yumcss/css/stylex";
import { createUnoCssAdapter } from "yumcss/css/unocss";
import { examplePreset } from "@yumcss/example-preset";

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
