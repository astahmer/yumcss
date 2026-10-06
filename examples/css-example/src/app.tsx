import { cardBProps } from "./card-b.ts";
import { cx } from "./cx.ts";
import { cvaButton } from "./cva.ts";
import { dss } from "./design.ts";

/**
 * cx merges class strings and resolves atom conflicts (later wins): it reads
 * the design engine's atom registry to know which properties each dropped
 * class would have set.
 */
// Module constants so the build-time extractor sees literal call sites; the
// cx() below still exercises the runtime conflict-resolution path.
const cardCLose = dss.class({ $frame: { fill: "$red-500" } });
const cardCWin = dss.class({ $frame: { fill: "$gray-800" } });
const cvaButtonClass = cvaButton({ size: "lg" });
const composeClasses = (base: string, extra: string) => cx(base, extra);

export function App() {
	return (
		<main style={{ fontFamily: "monospace" }}>
			<h1 data-testid="heading">yumcss css-example</h1>
			{/* A + D: two IDENTICAL literal call sites -> one shared atomic class (dedup). */}
			<section
				data-testid="card-a"
				data-style-id="shared-card"
				className={dss.class({
					$frame: { fill: "$blue-500", corners: "lg", pad: [4, 8] },
				})}
			>
				A — design vocabulary ($blue-500 / lg / pad 4 8)
			</section>
			<section data-testid="card-b" {...cardBProps}>
				B — composed css()
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
				className={dss.class({
					$frame: { fill: "$blue-500", corners: "lg", pad: [4, 8] },
				})}
			>
				D — dedup twin of A
			</section>
			<button
				data-testid="cva-button"
				className={composeClasses(cvaButtonClass, dss.class({ $text: { weight: "bold" } }))}
			>
				CVA selects YumCSS classes
			</button>
		</main>
	);
}
