import { AtomicApp } from "../atomic-app";
import { CssInJsApp } from "../css-in-js-app";
import { DesignApp } from "../design-app";
import { DogfoodApp } from "../dogfood-app";
import { ApiCatalogApp } from "./api-catalog-app";
import { DynamicApp } from "./dynamic-app";
import { TailwindApp } from "./tailwind-app";
import { ThemesApp } from "./themes-app";
import { TypedTwApp } from "./typed-tw-app";
import { TypedComponentsApp } from "./typed-components-app";

/**
 * A deliberately mixed API showcase. The first two cards preserve the
 * historical Tailwind-to-Pandwind migration example; the remaining cards
 * exercise Pandwind's native atomic, design, composition, runtime, component,
 * and theme APIs.
 */
export function MixedApisApp() {
	return (
		<>
			<TailwindApp />
			<TypedTwApp />
			<DynamicApp />
			<TypedComponentsApp />
			<ThemesApp />
			<AtomicApp />
			<CssInJsApp />
			<DesignApp />
			<DogfoodApp />
			<ApiCatalogApp />
		</>
	);
}
