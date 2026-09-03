/**
 * `<Stack>` Solid renderer — the same class contract as the React renderer,
 * with Solid's reactive prop split and `class` attribute convention. The
 * Dynamic host keeps this module independent from the consumer's JSX mode.
 */
import { createComponent, splitProps, type Component, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { stackClasses, type StackProps } from "./index.ts";

export interface StackComponentProps
	extends
		StackProps,
		Omit<JSX.HTMLAttributes<HTMLDivElement>, keyof StackProps | "class" | "children"> {
	class?: string;
	children?: JSX.Element;
}

export const Stack: Component<StackComponentProps> = (props) => {
	const [stack, attributes] = splitProps(props, [
		"direction",
		"gap",
		"padding",
		"align",
		"justify",
		"class",
		"children",
	]);
	const mapped = stackClasses(stack);
	return createComponent(Dynamic, {
		component: "div",
		...attributes,
		class: stack.class === undefined ? mapped : `${mapped} ${stack.class}`,
		children: stack.children,
	});
};
