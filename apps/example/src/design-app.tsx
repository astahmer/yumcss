import { css } from "./design";

/**
 * Same card, authored with the design css() vocabulary — reads like the
 * Figma inspector, and every value is a token or a constrained option.
 * These literal calls are extracted by `pandwindCssVite` into the generated
 * stylesheet, so nothing is accumulated at runtime.
 */
export function DesignApp() {
	return (
		<section
			className={css.class({
				$frame: {
					w: "100%",
					pad: [6, 8],
					corners: "xl",
					fill: "$white",
					border: "$gray-200",
					opacity: 95,
				},
				$layout: { flow: "stackY", gap: 6 },
				$text: { color: "$gray-900" },
			})}
		>
			<h1 className={css.class({ $text: { size: "3xl", weight: "bold" } })}>
				design css()
			</h1>
			<p className={css.class({ $text: { size: "sm", color: "$gray-600" } })}>
				$frame / $layout / $text — the box, its children and its type. Wrong
				values are type errors; the compiler is the contract.
			</p>
			<button
				type="button"
				className={css.class({
					$frame: {
						pad: [2, 4],
						corners: "md",
						fill: "$blue-600",
						border: { color: "$blue-700", width: 1 },
					},
					$layout: { flow: "stackX", align: "center", gap: 2 },
					$text: { size: "sm", weight: "semibold", color: "$white" },
					_hover: { $frame: { fill: "$blue-500" } },
				})}
			>
				Design button
			</button>
			<div className={css.class({ $layout: { flow: "stackX", gap: 2 } })}>
				<span
					className={css.class({ $text: { size: "xs", color: "$gray-500" } })}
				>
					hover it:
				</span>
				<span
					className={css.class({
						$text: { size: "xs", color: "$gray-700" },
						_hover: { $text: { color: "$blue-500" } },
					})}
				>
					the button darkens
				</span>
			</div>
		</section>
	);
}
