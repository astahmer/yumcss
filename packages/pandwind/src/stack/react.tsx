/**
 * `<Stack>` React runtime — a thin div wrapper around the pure
 * `stackClasses` mapper. Exists only for props the fold pass cannot erase
 * (dynamic values); fully static usages are rewritten to plain `div`s at
 * build time and this module never loads.
 *
 * React is an OPTIONAL peer dependency: apps that only use folded stacks
 * never install it. The published entry is compiled with the React automatic
 * JSX runtime; the workspace `pandwind` condition points at this source file
 * for local development.
 */
import type { HTMLAttributes, JSX, ReactNode } from "react";
import { stackClasses, type StackProps } from "./index.ts";

export interface StackComponentProps
	extends
		StackProps,
		Omit<HTMLAttributes<HTMLDivElement>, keyof StackProps | "className" | "children"> {
	/** Extra classes appended after the mapped ones (last-wins by author). */
	className?: string;
	children?: ReactNode;
}

export function Stack({ className, children, ...props }: StackComponentProps): JSX.Element {
	const { direction, gap, padding, align, justify, ...attributes } = props;
	const stack = { direction, gap, padding, align, justify } satisfies StackProps;
	const mapped = stackClasses(stack as StackProps);
	return (
		<div {...attributes} className={className === undefined ? mapped : `${mapped} ${className}`}>
			{children}
		</div>
	);
}
