/**
 * `<Stack>` Vue renderer — a render-function component so Vue owns attrs,
 * slots, and class normalization while Pandwind owns only style semantics.
 */
import { defineComponent, h, type HTMLAttributes, type PropType } from "vue";
import {
	stackClasses,
	type StackAlign,
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
	gap: String,
	padding: String,
	align: String as PropType<StackAlign>,
	justify: String as PropType<StackJustify>,
};

export const Stack = defineComponent({
	name: "PandwindStack",
	inheritAttrs: false,
	props: stackProps,
	setup(props, { attrs, slots }) {
		return () =>
			h(
				"div",
				{
					...attrs,
					class: [stackClasses(props satisfies StackProps), attrs.class],
				},
				slots.default?.(),
			);
	},
});
