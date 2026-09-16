import { createCss } from "pandwind/css";
import { createStack } from "pandwind/stack/vue";
import { createStackClassName, stackClasses, stackStyle } from "pandwind/stack";
import { examplePreset } from "@pandwind/example-preset";

const css = createCss(examplePreset);
const className = createStackClassName(css);
const Stack = createStack(css);
const props = { direction: "row" as const, gap: 4, align: "center" as const };

export const workload = {
	className: className(props),
	component: Stack,
	classes: stackClasses(props),
	style: stackStyle(props),
};
