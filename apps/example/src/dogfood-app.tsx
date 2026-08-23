import { tw } from "./tw";
import { css } from "./design";
import { cx } from "./cx";
import { CARD_BASE, MUTED_TEXT } from "./styles/constants";

/**
 * Dogfood surface for the full compiler pipeline:
 *
 * - condition-bound semantic tokens: `surface` bridges into @theme as
 *   `--color-surface` with a `.dark` override, so `bg-surface` flips color
 *   under `.dark` with zero runtime work;
 * - semantic sub-keys: textSize / textColor / bgColor / textAlign spell the
 *   overloaded Tailwind utilities explicitly;
 * - mixed cx(): imported constants + css() atom + conditional string in ONE
 *   call, folded at build time (css atoms compile through the shared engine
 *   context; imported constants propagate across modules).
 */
export function DogfoodApp() {
	const emphasized = true;

	return (
		<section className={tw({ bgColor: "surface", textAlign: "left", rounded: "lg", p: "4" })}>
			<div
				className={cx(
					CARD_BASE,
					"p-6",
					// Intentional runtime cx() dogfood (css atom + dynamic conditional):
					// everything else in the app folds at build time.
					// oxlint-disable-next-line pandwind-extraction/no-dynamic-values
					css.class({ $text: { color: "$green-500", weight: "semibold" } }),
					emphasized && "ring-2 ring-sky-500/40",
				)}
			>
				<h1 className={tw({ textSize: "2xl", textColor: "gray-900" })}>dogfooding</h1>
				<p className={MUTED_TEXT}>
					This card is authored entirely through pandwind: condition-bound semantic tokens (
					<code>bg-surface</code> flips under <code>.dark</code>), semantic sub-keys, and a single
					mixed <code>cx()</code> call — all folded at build time.
				</p>
			</div>
		</section>
	);
}
