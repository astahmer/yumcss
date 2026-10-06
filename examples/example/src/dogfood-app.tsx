import { untypedCss } from "./css";
import { dss } from "./design";
import { cx } from "./cx";
import { CARD_BASE, CARD_SURFACE, MUTED_TEXT } from "./styles/constants";

/**
 * Dogfood surface for the full compiler pipeline:
 *
 * - design tokens and modules remain explicit in source;
 * - imported design atoms compose through the same YumCSS registry;
 * - conditional styling remains a normal class composition decision.
 */
export function DogfoodApp() {
	const emphasized = true;

	return (
		<section
			className={dss.class({
				$frame: { fill: "$gray-50", corners: "lg", pad: 16 },
				$text: { align: "left" },
			})}
		>
			<div
				className={cx(
					CARD_BASE,
					CARD_SURFACE,
					dss.class({ $text: { color: "$green-500", weight: "semibold" }, $frame: { pad: 24 } }),
					emphasized
						? untypedCss.class({ outline: "2px solid rgba(14,165,233,0.4)", outlineOffset: "2px" })
						: undefined,
				)}
			>
				<h1 className={dss.class({ $text: { size: "2xl", color: "$gray-900" } })}>dogfooding</h1>
				<p className={MUTED_TEXT}>
					This card is authored entirely through YumCSS design atoms, token references, and a single
					mixed <code>cx()</code> call.
				</p>
			</div>
		</section>
	);
}
