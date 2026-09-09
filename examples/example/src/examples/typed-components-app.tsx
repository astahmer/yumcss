import type { CSSProperties, PropsWithChildren } from "react";
import type { AtomicStyleProps } from "pandwind/css";
import { css } from "../css";
import { cx } from "../cx";
import { tw } from "../tw";

/**
 * A component can expose a deliberate style contract instead of forwarding
 * the entire preset vocabulary. Consumers get token-aware values for these
 * three properties only, plus normal host escape hatches.
 */
type PanelStyleProps = Pick<
	AtomicStyleProps<typeof css>,
	"backgroundColor" | "borderRadius" | "padding"
>;

type PanelProps = PropsWithChildren<
	PanelStyleProps & {
		className?: string;
		style?: CSSProperties;
	}
>;

function Panel({ children, className, style, ...styleProps }: PanelProps) {
	const generated = css.props(css(styleProps));
	return (
		<article
			className={cx(generated.className, className)}
			style={{ ...generated.style, ...style }}
		>
			{children}
		</article>
	);
}

/**
 * The component boundary is typed independently from the preset. It accepts
 * only the style props that make sense for this component while still
 * allowing callers to add a class and host style overrides.
 */
export function TypedComponentsApp() {
	return (
		<section className={tw({ mx: "auto", maxW: "md", rounded: "xl", bg: "white", p: "6" })}>
			<h2 className={tw({ textSize: "xl", font: "bold", textColor: "gray-900" })}>
				Typed component props
			</h2>
			<p className={tw({ mt: "2", textSize: "sm", textColor: "gray-600" })}>
				The component narrows the preset to a small, useful style contract and merges generated
				classes with caller-provided className and style props.
			</p>

			<Panel
				backgroundColor="$gray-50"
				borderRadius="lg"
				padding={16}
				className={tw({ mt: "4", border: "1", borderColor: "gray-200" })}
				style={{ borderInlineStart: "4px solid #3182ce" }}
			>
				<strong className={tw({ textColor: "gray-900" })}>Panel</strong>
				<p className={tw({ mt: "2", textSize: "sm", textColor: "gray-700" })}>
					Try changing the component's props in this file: arbitrary style keys do not leak into its
					public contract.
				</p>
			</Panel>
		</section>
	);
}
