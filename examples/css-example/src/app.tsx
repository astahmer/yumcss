import { type CssFn } from "pandwind/css";
import { createCx } from "pandwind/cx";
import { cardBClass } from "./card-b.ts";
import { cvaButton } from "./cva.ts";
import { dcss } from "./design.ts";

/**
 * cx merges class strings and resolves atom conflicts (later wins): it reads
 * the design engine's atom registry to know which properties each dropped
 * class would have set.
 */
const cx = createCx({ css: dcss as unknown as CssFn<never> });

// Module constants so the build-time extractor sees literal call sites; the
// cx() below still exercises the runtime conflict-resolution path.
const cardCLose = dcss.class({ $frame: { fill: "$red-500" } });
const cardCWin = dcss.class({ $frame: { fill: "$gray-800" } });
const cvaButtonClass = cvaButton({ size: "lg" });
const composeClasses = (base: string, extra: string) => cx(base, extra);

export function App() {
	return (
		<main style={{ fontFamily: "monospace" }}>
			<h1 data-testid="heading">pandwind css-example</h1>
			{/* A + D: two IDENTICAL literal call sites -> one shared atomic class (dedup). */}
			<section
				data-testid="card-a"
				data-style-id="shared-card"
				className={dcss.class({
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
				className={cx(cardCLose, cardCWin)}
			>
				C — cx conflict resolution, later wins ($gray-800)
			</section>
			<section
				data-testid="card-d"
				data-style-id="shared-card"
				className={dcss.class({
					$frame: { fill: "$blue-500", corners: "lg", pad: [4, 8] },
				})}
			>
				D — dedup twin of A
			</section>
			<button
				data-testid="cva-button"
				className={composeClasses(cvaButtonClass, dcss.class({ $text: { weight: "bold" } }))}
			>
				CVA selects Pandwind classes
			</button>
		</main>
	);
}
