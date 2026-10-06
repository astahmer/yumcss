/**
 * `<Stack>` React runtime. The default export is the Tailwind-compatible
 * mapper; `createStack(css)` binds the component to a CSS compiler's class
 * strategy. Fully static usages can be rewritten to plain `div`s at build
 * time.
 *
 * React is an OPTIONAL peer dependency: apps that only use folded stacks
 * never install it. The published entry is compiled with the React automatic
 * JSX runtime; the workspace `yumcss` condition points at this source file
 * for local development.
 */
import type { HTMLAttributes, JSX, ReactNode } from "react";
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
		Omit<HTMLAttributes<HTMLDivElement>, keyof StackProps | "className" | "children"> {
	/** Extra classes appended after the mapped ones (last-wins by author). */
	className?: string;
	children?: ReactNode;
}

export type { StackProps } from "./index.ts";

const createReactStack =
	(classNameFor: StackClassName) =>
	({ className, children, ...props }: StackComponentProps): JSX.Element => {
		const { direction, gap, padding, align, justify, ...attributes } = props;
		const stack = { direction, gap, padding, align, justify } satisfies StackProps;
		const mapped = classNameFor(stack);
		return (
			<div {...attributes} className={className === undefined ? mapped : `${mapped} ${className}`}>
				{children}
			</div>
		);
	};

/** Bind the React Stack component to one CSS compiler. */
export const createStack = (css: StackClassCompiler) => createReactStack(createStackClassName(css));

/** Tailwind-compatible Stack component; use `createStack(css)` for other lanes. */
export const Stack = createReactStack(stackClasses);
