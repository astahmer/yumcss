import { createCss } from "yumcss/css";
import { createStack } from "yumcss/stack/vue";
import { createStackClassName, stackClasses, stackStyle } from "yumcss/stack";
import { examplePreset } from "@yumcss/example-preset";

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
