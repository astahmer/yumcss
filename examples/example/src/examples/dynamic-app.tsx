import { useState } from "react";
import { css, runtimeCss, untypedCss } from "../css";
import { cx } from "../cx";
import { tw } from "../tw";

const dynamicButtonGroup = runtimeCss.group({
	button: {
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
 * - a runtime-sheet group keeps its class stable while its inputs change.
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
	const runtimeButtonProps = runtimeCss.props(
		dynamicButtonGroup.button({
			background: accent,
			padding: `${padding}px ${padding * 2}px`,
		}),
	);

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
					React state changes the values at runtime; Pandwind keeps the static and dynamic parts
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
				<button
					type="button"
					className={runtimeButtonProps.className}
					style={runtimeButtonProps.style}
				>
					createRuntimeCss() input group
				</button>
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
