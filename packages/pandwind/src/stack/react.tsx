/**
 * `<Stack>` React runtime — a thin div wrapper around the pure
 * `stackClasses` mapper. Exists only for props the fold pass cannot erase
 * (dynamic values); fully static usages are rewritten to plain `div`s at
 * build time and this module never loads.
 *
 * React is an OPTIONAL peer dependency: apps that only use folded stacks
 * never install it. There is no package build step — consumer bundlers
 * compile this `.tsx` with their own automatic JSX runtime.
 */
import type { JSX, ReactNode } from "react";
import { stackClasses, type StackProps } from "./index.ts";

export interface StackComponentProps extends StackProps {
	/** Extra classes appended after the mapped ones (last-wins by author). */
	className?: string;
	children?: ReactNode;
}

export function Stack({ className, children, ...stack }: StackComponentProps): JSX.Element {
	const mapped = stackClasses(stack as StackProps);
	return (
		<div className={className === undefined ? mapped : `${mapped} ${className}`}>{children}</div>
	);
}
