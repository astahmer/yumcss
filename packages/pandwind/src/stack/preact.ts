/**
 * `<Stack>` Preact renderer — a Preact-native `className`/children boundary
 * over the shared, renderer-neutral Stack class mapper.
 */
import { h, type ComponentChildren, type JSX } from "preact";
import { stackClasses, type StackProps } from "./index.ts";

export interface StackComponentProps
	extends
		StackProps,
		Omit<JSX.HTMLAttributes<HTMLDivElement>, keyof StackProps | "className" | "children"> {
	className?: string;
	children?: ComponentChildren;
}

export function Stack({ className, children, ...props }: StackComponentProps): JSX.Element {
	const { direction, gap, padding, align, justify, ...attributes } = props;
	const mapped = stackClasses({ direction, gap, padding, align, justify } satisfies StackProps);
	return h(
		"div",
		{
			...attributes,
			className: className === undefined ? mapped : `${mapped} ${className}`,
		},
		children,
	);
}
