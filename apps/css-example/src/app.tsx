import { type CssFn } from "pandwind/css";
import { createCx } from "pandwind/cx";
import { cardBClass } from "./card-b.ts";
import { css } from "./design.ts";

/**
 * cx merges class strings and resolves atom conflicts (later wins): it reads
 * the design engine's atom registry to know which properties each dropped
 * class would have set.
 */
const cx = createCx({ css: css as unknown as CssFn<never> });

export function App() {
	return (
		<main style={{ fontFamily: "monospace" }}>
			<h1 data-testid="heading">pandwind css-example</h1>
			{/* A + D: two IDENTICAL literal call sites -> one shared atomic class (dedup). */}
			<section
				data-testid="card-a"
				data-style-id="shared-card"
				className={css.class({
					$frame: { fill: "$blue-500", corners: "lg", pad: [4, 8] },
				})}
			>
				A — design vocabulary ($blue-500 / lg / pad 4 8)
			</section>
			<section data-testid="card-b" className={cardBClass}>
				B — raw css()
			</section>
			<section
				data-testid="card-c"
				data-expected="rgb(31, 41, 55)"
				className={cx(
					css.class({ $frame: { fill: "$red-500" } }),
					css.class({ $frame: { fill: "$gray-800" } }),
				)}
			>
				C — cx conflict resolution, later wins ($gray-800)
			</section>
			<section
				data-testid="card-d"
				data-style-id="shared-card"
				className={css.class({
					$frame: { fill: "$blue-500", corners: "lg", pad: [4, 8] },
				})}
			>
				D — dedup twin of A
			</section>
		</main>
	);
}
