/**
 * `<Stack>` Preact renderer — a Preact-native `className`/children boundary.
 * The default component uses the Tailwind-compatible mapper; `createStack`
 * binds it to a CSS compiler's class strategy.
 */
import { h, type ComponentChildren, type JSX } from "preact";
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
		Omit<JSX.HTMLAttributes<HTMLDivElement>, keyof StackProps | "className" | "children"> {
	className?: string;
	children?: ComponentChildren;
}

const createPreactStack =
	(classNameFor: StackClassName) =>
	({ className, children, ...props }: StackComponentProps): JSX.Element => {
		const { direction, gap, padding, align, justify, ...attributes } = props;
		const stack = { direction, gap, padding, align, justify } satisfies StackProps;
		const mapped = classNameFor(stack);
		return h(
			"div",
			{
				...attributes,
				className: className === undefined ? mapped : `${mapped} ${className}`,
			},
			children,
		);
	};

/** Bind the Preact Stack component to one CSS compiler. */
export const createStack = (css: StackClassCompiler) =>
	createPreactStack(createStackClassName(css));

/** Tailwind-compatible Stack component; use `createStack(css)` for other lanes. */
export const Stack = createPreactStack(stackClasses);
