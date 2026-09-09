import { DesignApp } from "../design-app";
import { DogfoodApp } from "../dogfood-app";
import { ApiCatalogApp } from "./api-catalog-app";
import { DynamicApp } from "./dynamic-app";
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
			<TypedTwApp />
			<DynamicApp />
			<TypedComponentsApp />
			<ThemesApp />
			<DesignApp />
			<DogfoodApp />
			<ApiCatalogApp />
		</>
	);
}
