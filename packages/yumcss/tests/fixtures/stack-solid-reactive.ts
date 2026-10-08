import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { Stack } from "yumcss/stack/solid";

export const mountReactiveStack = (host: HTMLElement) => {
	const [gap, setGap] = createSignal(4);
	const [className, setClassName] = createSignal("before");
	const [title, setTitle] = createSignal("before title");
	const [children, setChildren] = createSignal("before children");
	const dispose = render(
		() =>
			createComponent(Stack, {
				get gap() {
					return gap();
				},
				get class() {
					return className();
				},
				get title() {
					return title();
				},
				get children() {
					return children();
				},
			}),
		host,
	);
	return {
		dispose,
		update: () => {
			setGap(8);
			setClassName("after");
			setTitle("after title");
			setChildren("after children");
		},
	};
};
