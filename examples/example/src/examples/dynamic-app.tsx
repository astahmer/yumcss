import { useState, type PropsWithChildren } from "react";
import { css, untypedCss } from "../css";
import { cx } from "../cx";
import { tw } from "../tw";

type DynamicButtonInput = {
	background: string;
	padding: string;
};

// With yumcssExtractVite, createCss is enough for typed input groups: the
// structural `var(--...)` rules are extracted at build time and only the
// changing values travel through the host style prop.
const dynamicButtonGroup = css.group({
	button: {
		$input: {} as DynamicButtonInput,
		display: "block",
		backgroundColor: css.input("background"),
		color: "$white",
		padding: css.input("padding"),
		borderRadius: "md",
	},
});

function DynamicInputButton({ children, ...input }: PropsWithChildren<DynamicButtonInput>) {
	const props = css.props(dynamicButtonGroup.button(input));
	return (
		<button type="button" className={props.className} style={props.style}>
			{children}
		</button>
	);
}

/**
 * Compiler-carrier examples. `transformDynamicClassName` is enabled in this
 * example's Vite config, so the first host uses the concise className form and
 * the compiler moves only `color` to css.vars(). The callable host below uses
 * the same static/dynamic partition for a mixed JSX spread.
 */
function CompilerCarrierExamples({ accent }: { accent: string }) {
	return (
		<div
			className={tw({
				flex: "col",
				gap: "2",
				rounded: "md",
				border: "1",
				borderColor: "gray-200",
				p: "3",
			})}
		>
			<p className={tw({ textSize: "xs", textColor: "gray-600" })}>
				Compiler carriers: static declarations become extracted classes; changing values stay
				inline.
			</p>
			<button
				type="button"
				className={
					/* yumcss:migrate-skip (residual: accent is carried by the opt-in dynamic className transform) */ untypedCss.class(
						{
							color: accent,
							backgroundColor: "white",
							padding: "8px",
							borderRadius: "md",
						},
					)
				}
			>
				opt-in dynamic className rewrite
			</button>
			<div
				{
					/* yumcss:migrate-skip (residual: accent remains a runtime value in the callable host carrier) */ ...untypedCss(
						{
							color: "white",
							backgroundColor: accent,
							padding: "8px",
							borderRadius: "md",
						},
					)
				}
			>
				mixed callable JSX spread
			</div>
		</div>
	);
}

type Tone = "blue" | "red";
type Density = "compact" | "roomy";

// The preset emits --color-surface with a `.dark` override. The utility stays
// unchanged while the parent state toggles the semantic token scope.
const semanticSurfaceClass = untypedCss.class({ backgroundColor: "var(--color-surface)" });

/**
 * The runtime boundary in one small, executable example:
 *
 * - state selects finite `tw()` values, so both classes remain discoverable;
 * - `css.vars()` carries a user value through an inline custom property; and
 * - a typed css.input group keeps its class stable while its inputs change;
 *   yumcssExtractVite emits the structural rules without a runtime sheet.
 */
export function DynamicApp() {
	const [tone, setTone] = useState<Tone>("blue");
	const [density, setDensity] = useState<Density>("compact");
	const [accent, setAccent] = useState("#2563eb");
	const [padding, setPadding] = useState(12);
	const [dark, setDark] = useState(false);

	const dynamicTwClass = tw({
		bg: tone === "blue" ? "blue-500" : "red-500",
		hover: { bg: tone === "blue" ? "blue-600" : "red-600" },
		p: density === "compact" ? "3" : "6",
		text: "white",
		font: "semibold",
		rounded: "lg",
		transition: "colors",
	});
	const accentProps = css.props(css.vars({ color: accent }));

	return (
		<section
			className={cx(
				tw({
					mx: "auto",
					maxW: "md",
					spaceY: "4",
					rounded: "xl",
					border: "1",
					borderColor: "gray-200",
					bg: "gray-50",
					p: "6",
				}),
				dark ? "dark" : undefined,
			)}
		>
			<header>
				<h2 className={tw({ textSize: "xl", textColor: "gray-900", font: "bold" })}>
					Dynamic styling
				</h2>
				<p className={tw({ mt: "2", textSize: "sm", textColor: "gray-600" })}>
					React state changes the values at runtime; YumCSS keeps the static and dynamic parts
					visible.
				</p>
			</header>

			<div className={tw({ flex: "col", gap: "3", textSize: "sm" })}>
				<label className={tw({ flex: "col", gap: "1", font: "medium" })}>
					Tone: {tone}
					<select
						value={tone}
						onChange={(event) => setTone(event.currentTarget.value as Tone)}
						className={tw({ rounded: "md", border: "1", borderColor: "gray-300", p: "2" })}
					>
						<option value="blue">blue-500</option>
						<option value="red">red-500</option>
					</select>
				</label>
				<label className={tw({ flex: "col", gap: "1", font: "medium" })}>
					Density: {density}
					<select
						value={density}
						onChange={(event) => setDensity(event.currentTarget.value as Density)}
						className={tw({ rounded: "md", border: "1", borderColor: "gray-300", p: "2" })}
					>
						<option value="compact">compact</option>
						<option value="roomy">roomy</option>
					</select>
				</label>
				<label className={tw({ flex: "col", gap: "1", font: "medium" })}>
					Accent: {accent}
					<input
						type="color"
						value={accent}
						onChange={(event) => setAccent(event.currentTarget.value)}
						className={tw({ h: "10", w: "full", rounded: "md", border: "0", p: "0" })}
					/>
				</label>
				<label className={tw({ flex: "col", gap: "1", font: "medium" })}>
					Runtime padding: {padding}px
					<input
						type="range"
						min="8"
						max="24"
						step="4"
						value={padding}
						onChange={(event) => setPadding(Number(event.currentTarget.value))}
					/>
				</label>
			</div>

			<div
				className={cx(
					tw({ spaceY: "3", rounded: "lg", p: "4", shadow: "sm" }),
					semanticSurfaceClass,
				)}
			>
				<button type="button" className={dynamicTwClass}>
					finite dynamic tw() values
				</button>
				<p className={cx(tw({ textSize: "sm" }), accentProps.className)} style={accentProps.style}>
					css.vars() keeps the selected color in an inline custom property.
				</p>
				<DynamicInputButton background={accent} padding={`${padding}px ${padding * 2}px`}>
					createCss(preset) typed input group
				</DynamicInputButton>
				<CompilerCarrierExamples accent={accent} />
			</div>

			<button
				type="button"
				aria-pressed={dark}
				onClick={() => setDark((value) => !value)}
				className={tw({
					textSize: "sm",
					font: "medium",
					textColor: "gray-700",
					underline: true,
				})}
			>
				{dark ? "Use light surface" : "Use dark surface"}
			</button>
		</section>
	);
}
