import dogfoodSource from "../dogfood-app.tsx?raw";
import designSource from "../design-app.tsx?raw";
import { DesignApp } from "../design-app";
import { DogfoodApp } from "../dogfood-app";
import apiCatalogSource from "./api-catalog-app.tsx?raw";
import { ApiCatalogApp } from "./api-catalog-app";
import { DynamicApp } from "./dynamic-app";
import dynamicSource from "./dynamic-app.tsx?raw";
import { ExampleFrame } from "./example-frame";
import { ThemesApp } from "./themes-app";
import themesSource from "./themes-app.tsx?raw";
import { TypedTwApp } from "./typed-tw-app";
import { TypedComponentsApp } from "./typed-components-app";
import typedComponentsSource from "./typed-components-app.tsx?raw";
import typedTwSource from "./typed-tw-app.tsx?raw";

/** A focused showcase of the distinct Pandwind usage patterns. */
export function MixedApisApp() {
	return (
		<>
			<ExampleFrame fileName="typed-tw-app.tsx" source={typedTwSource}>
				<TypedTwApp />
			</ExampleFrame>
			<ExampleFrame fileName="dynamic-app.tsx" source={dynamicSource}>
				<DynamicApp />
			</ExampleFrame>
			<ExampleFrame fileName="typed-components-app.tsx" source={typedComponentsSource}>
				<TypedComponentsApp />
			</ExampleFrame>
			<ExampleFrame fileName="themes-app.tsx" source={themesSource}>
				<ThemesApp />
			</ExampleFrame>
			<ExampleFrame fileName="design-app.tsx" source={designSource}>
				<DesignApp />
			</ExampleFrame>
			<ExampleFrame fileName="dogfood-app.tsx" source={dogfoodSource}>
				<DogfoodApp />
			</ExampleFrame>
			<ExampleFrame fileName="api-catalog-app.tsx" source={apiCatalogSource} fullWidth>
				<ApiCatalogApp />
			</ExampleFrame>
		</>
	);
}
