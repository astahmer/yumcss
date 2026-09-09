import { tw } from "../tw";

const plainButtonClassName =
	"rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";

const typedButtonClassName = tw({
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
});

/**
 * Same design, authored with the typed `tw()` object syntax.
 * Types are generated from the real Tailwind design system (see types.d.ts).
 */
export function TypedTwApp() {
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
				Tailwind classes and typed tw()
			</h1>
			<p className={tw({ text: ["sm", "gray-600"], leading: "6" })}>
				The same styling intent can stay as a class string or move to a typed object.{" "}
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
			<div className={tw({ flex: "col", gap: "3", sm: { flex: "row" } })}>
				<div className={tw({ flex: "col", gap: "2", grow: "1" })}>
					<strong className={tw({ textSize: "sm", textColor: "gray-900" })}>Plain className</strong>
					<button type="button" className={plainButtonClassName}>
						Plain button
					</button>
				</div>
				<div className={tw({ flex: "col", gap: "2", grow: "1" })}>
					<strong className={tw({ textSize: "sm", textColor: "gray-900" })}>Typed object</strong>
					<button type="button" className={typedButtonClassName}>
						Typed button
					</button>
				</div>
			</div>
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
