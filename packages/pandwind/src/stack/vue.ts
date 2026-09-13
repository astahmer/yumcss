/**
 * `<Stack>` Vue renderer — a render-function component so Vue owns attrs,
 * slots, and class normalization while Pandwind owns only style semantics.
 * The default component uses the Tailwind-compatible mapper; `createStack`
 * binds it to a CSS compiler's class strategy.
 */
import { defineComponent, h, type HTMLAttributes, type PropType } from "vue";
import {
	createStackClassName,
	stackClasses,
	type StackAlign,
	type StackClassCompiler,
	type StackClassName,
	type StackCssValue,
	type StackDirection,
	type StackJustify,
	type StackProps,
} from "./index.ts";

export interface StackComponentProps
	extends StackProps, Omit<HTMLAttributes, keyof StackProps | "class"> {
	class?: HTMLAttributes["class"];
}

const stackProps = {
	direction: String as PropType<StackDirection>,
	gap: [String, Number] as PropType<StackCssValue>,
	padding: [String, Number] as PropType<StackCssValue>,
	align: String as PropType<StackAlign>,
	justify: String as PropType<StackJustify>,
};

const createVueStack = (classNameFor: StackClassName) =>
	defineComponent({
		name: "PandwindStack",
		inheritAttrs: false,
		props: stackProps,
		setup(props, { attrs, slots }) {
			return () => {
				const stack = {
					direction: props.direction,
					gap: props.gap,
					padding: props.padding,
					align: props.align,
					justify: props.justify,
				} satisfies StackProps;
				return h(
					"div",
					{
						...attrs,
						class: [classNameFor(stack), attrs.class],
					},
					slots.default?.(),
				);
			};
		},
	});

/** Bind the Vue Stack component to one CSS compiler. */
export const createStack = (css: StackClassCompiler) => createVueStack(createStackClassName(css));

/** Tailwind-compatible Stack component; use `createStack(css)` for other lanes. */
export const Stack = createVueStack(stackClasses);
