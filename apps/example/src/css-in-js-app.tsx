import { tw } from "./tw";

/**
 * Same design, authored with the typed `tw()` object syntax.
 * Types are generated from the real Tailwind design system (see types.d.ts).
 */
export function CssInJsApp() {
	return (
		<section
			className={tw({
				mx: "auto",
				maxW: "md",
				spaceY: "6",
				rounded: "xl",
				bg: "white",
				p: "6",
				shadow: "lg",
				ring: ["1", "gray-900/5"],
			})}
		>
			<h1 className={tw({ text: ["2xl", "gray-900"], font: "bold" })}>
				typed tw()
			</h1>
			<p className={tw({ text: ["sm", "gray-600"], leading: "6" })}>
				Hover the button:{" "}
				<code
					className={tw({
						rounded: "md",
						bg: "gray-100",
						px: "1",
						py: "0.5",
						font: "mono",
						text: ["xs", "sky-700"],
					})}
				>
					tw()
				</code>{" "}
				emits the same classes Tailwind scans and compiles.
			</p>
			<button
				type="button"
				className={tw({
					rounded: "md",
					bg: "sky-600",
					px: "4",
					py: "2",
					text: ["sm", "white"],
					font: "semibold",
					shadow: "sm",
					transition: "colors",
					hover: { bg: "sky-700" },
					focusVisible: {
						outline: ["2", "sky-600"],
						outlineOffset: "2",
					},
				})}
			>
				Typed button
			</button>
			<div className={tw({ flex: "col", gap: "2", sm: { flex: "row" } })}>
				<span className={tw({ text: ["xs", "gray-500"] })}>responsive:</span>
				<span
					className={tw({
						text: ["xs", "gray-700"],
						font: "medium",
						dark: { text: "gray-300" },
					})}
				>
					stack on mobile, row on sm+
				</span>
			</div>
		</section>
	);
}
