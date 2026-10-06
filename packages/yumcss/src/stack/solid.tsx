/**
 * `<Stack>` Solid renderer — Solid's reactive prop split and `class`
 * attribute convention. The default component uses the Tailwind-compatible
 * mapper; `createStack(css)` binds it to a CSS compiler's class strategy.
 */
import { createComponent, splitProps, type Component, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import {
	createStackClassName,
	stackClasses,
	type StackClassCompiler,
	type StackClassName,
	type StackProps,
} from "./index.ts";

export interface StackComponentProps
	extends
		StackProps,
		Omit<JSX.HTMLAttributes<HTMLDivElement>, keyof StackProps | "class" | "children"> {
	class?: string;
	children?: JSX.Element;
}

const createSolidStack =
	(classNameFor: StackClassName): Component<StackComponentProps> =>
	(props) => {
		const [stack, attributes] = splitProps(props, [
			"direction",
			"gap",
			"padding",
			"align",
			"justify",
			"class",
			"children",
		]);
		const stackProps = {
			direction: stack.direction,
			gap: stack.gap,
			padding: stack.padding,
			align: stack.align,
			justify: stack.justify,
		} satisfies StackProps;
		const mapped = classNameFor(stackProps);
		return createComponent(Dynamic, {
			component: "div",
			...attributes,
			class: stack.class === undefined ? mapped : `${mapped} ${stack.class}`,
			children: stack.children,
		});
	};

/** Bind the Solid Stack component to one CSS compiler. */
export const createStack = (css: StackClassCompiler) => createSolidStack(createStackClassName(css));

/** Tailwind-compatible Stack component; use `createStack(css)` for other lanes. */
export const Stack = createSolidStack(stackClasses);
