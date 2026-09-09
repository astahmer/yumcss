import { css, relaxedCss, runtimeCss, untypedCss } from "./css";

const declarationMap = css({
	color: "$gray-900",
	_hover: { color: "$blue-600" },
});

const declarationProps = css.props(declarationMap);
const dynamicProps = css.props(css.vars({ color: "var(--example-accent)" }));

const styleGroups = css.group({
	button: {
		display: "block",
		backgroundColor: "$blue-600",
		color: "$white",
		padding: 8,
		borderRadius: "md",
		_hover: { backgroundColor: "$blue-700" },
	},
	badge: {
		display: "inline-block",
		backgroundColor: "$gray-100",
		color: "$gray-700",
		padding: 4,
		borderRadius: "base",
	},
});

const inputGroups = runtimeCss.group({
	dynamicButton: {
		$input: {
			background: {} as string,
			padding: {} as string,
		},
		display: "block",
		backgroundColor: runtimeCss.input("background"),
		color: "$white",
		padding: runtimeCss.input("padding"),
		borderRadius: "md",
	},
});

const dynamicGroupProps = runtimeCss.props(
	inputGroups.dynamicButton({
		background: "var(--example-accent)",
		padding: "12px 20px",
	}),
);

const rawStyle = untypedCss.raw({
	border: "1px solid #e5e7eb",
	backgroundColor: "#f9fafb",
	padding: "8px 12px",
});

const relaxedStyle = relaxedCss.raw({
	color: "rebeccapurple",
	padding: "12px",
	borderRadius: "10px",
});

/**
 * One card that documents the complete web `createCss` surface in executable
 * code: preset-bound strict typing, relaxed typing, the untyped convenience
 * form, conditions, tokens, dynamic vars, props, groups, inputs, and raw CSS.
 */
export function CssInJsApp() {
	return (
		<section
			className={css.class({
				display: "block",
				margin: "auto",
				padding: 24,
				borderRadius: "xl",
				backgroundColor: "$white",
				color: "$gray-900",
				sm: { padding: 16 },
			})}
		>
			<h1 className={css.class({ fontSize: "1.5rem", color: "$gray-900" })}>
				createCss(examplePreset)
			</h1>
			<p className={css.class({ fontSize: "0.875rem", color: "$gray-600" })}>
				Strict CSS objects know the preset's token names and conditions. The calls below exercise
				every projection on the returned function.
			</p>

			<div className={css.class({ display: "block", padding: 16, borderRadius: "lg" })}>
				<button type="button" {...declarationProps}>
					css() + props()
				</button>
				<button type="button" {...dynamicProps}>
					vars() + props()
				</button>
				<button type="button" {...dynamicGroupProps}>
					createRuntimeCss(examplePreset) + group() + input()
				</button>
				<span className={css.props(styleGroups.badge).className}>grouped token style</span>
			</div>

			<div style={rawStyle}>
				<strong>createCss()</strong> is the untyped convenience form; <code>raw()</code> keeps an
				ordinary style object for an inline-style host.
			</div>
			<div style={relaxedStyle}>
				<strong>strict: false</strong> keeps the same tokens and conditions while allowing values
				such as <code>rebeccapurple</code> and <code>10px</code>.
			</div>
		</section>
	);
}
