import { AtomicApp } from "../atomic-app";
import { CssInJsApp } from "../css-in-js-app";
import { DesignApp } from "../design-app";
import { DogfoodApp } from "../dogfood-app";
import { TailwindApp } from "./tailwind-app";
import { TypedTwApp } from "./typed-tw-app";

/**
 * A deliberately mixed API showcase. The first two cards preserve the
 * historical Tailwind-to-Pandwind migration example; the remaining cards
 * exercise Pandwind's native atomic, design, and composition APIs.
 */
export function MixedApisApp() {
	return (
		<>
			<TailwindApp />
			<TypedTwApp />
			<AtomicApp />
			<CssInJsApp />
			<DesignApp />
			<DogfoodApp />
		</>
	);
}
