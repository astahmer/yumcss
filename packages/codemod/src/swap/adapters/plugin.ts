import { createStyleAdapterPlugin, type StyleAdapterPlugin } from "../adapter-registry.ts";
import type { AdapterConfigContext, StyleAdapter } from "../adapter-contract.ts";
import { CodemodPluginId } from "../identifiers.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import type { StyleXImportedReferenceResolver } from "./stylex.adapter.ts";
import aphrodite from "./aphrodite.adapter.ts";
import bamboo from "./bamboo.adapter.ts";
import { createChakraAdapter } from "./chakra.adapter.ts";
import compiled from "./compiled.adapter.ts";
import emotion from "./emotion.adapter.ts";
import fela from "./fela.adapter.ts";
import goober from "./goober.adapter.ts";
import jss from "./jss.adapter.ts";
import linaria from "./linaria.adapter.ts";
import { createMantineAdapter } from "./mantine.adapter.ts";
import { createMuiAdapter } from "./mui.adapter.ts";
import nextYak from "./next-yak.adapter.ts";
import { createPandaAdapter } from "./panda.adapter.ts";
import { createPandwindAdapter } from "./pandwind.adapter.ts";
import reactNative from "./react-native.adapter.ts";
import solidStyled from "./solid-styled.adapter.ts";
import stitches from "./stitches.adapter.ts";
import style9 from "./style9.adapter.ts";
import { createStyleXAdapter } from "./stylex.adapter.ts";
import styledComponents from "./styled-components.adapter.ts";
import { createTailwindAdapter, type TailwindUtilityResolver } from "./tailwind.adapter.ts";
import treat from "./treat.adapter.ts";
import vanillaExtract from "./vanilla-extract.adapter.ts";
import vueStyled from "./vue-styled.adapter.ts";
import { createTokenamiAdapter } from "./tokenami.adapter.ts";
import { createUnoCssAdapter } from "./unocss.adapter.ts";
import { authoredCssAdapter } from "./authored-css.adapter.ts";
import { cssModulesAdapter } from "./css-modules.adapter.ts";
import { createLessAdapter, lessAdapter } from "./less.adapter.ts";
import { createSassAdapter, sassAdapter } from "./sass.adapter.ts";
import { createTamaguiAdapter } from "./tamagui.adapter.ts";

/** The built-in set is a composition root; adapter modules remain opaque to callers. */
export interface BuiltinAdapterPluginOptions {
	readonly moduleLoader?: ProjectModuleLoader;
	readonly stylexResolver?: StyleXImportedReferenceResolver;
	readonly tailwindResolver?: TailwindUtilityResolver;
	readonly readFile?: (file: string) => string | undefined;
}

function withProjectFileReader(
	adapter: StyleAdapter,
	readFile: BuiltinAdapterPluginOptions["readFile"],
): StyleAdapter {
	if (readFile === undefined) return adapter;
	return {
		...adapter,
		loadConfig: (context: AdapterConfigContext) =>
			adapter.loadConfig({ ...context, readFile: context.readFile ?? readFile }),
		...(adapter.loadConfigAsync === undefined
			? {}
			: {
					loadConfigAsync: (context: AdapterConfigContext) =>
						adapter.loadConfigAsync!({ ...context, readFile: context.readFile ?? readFile }),
				}),
	};
}

export function createBuiltinAdapterPlugin(
	options: BuiltinAdapterPluginOptions = {},
): StyleAdapterPlugin {
	const { moduleLoader, stylexResolver, tailwindResolver, readFile } = options;
	const stylex = createStyleXAdapter({ crossModuleResolver: stylexResolver });
	const adapters: readonly StyleAdapter[] = [
		createPandwindAdapter({ moduleLoader: moduleLoader ?? null }),
		bamboo,
		moduleLoader === undefined
			? createChakraAdapter({ moduleLoader: null })
			: createChakraAdapter({ moduleLoader }),
		emotion,
		styledComponents,
		vanillaExtract,
		stitches,
		linaria,
		moduleLoader === undefined
			? createMantineAdapter({ moduleLoader: null })
			: createMantineAdapter({ moduleLoader }),
		moduleLoader === undefined
			? createMuiAdapter({ moduleLoader: null })
			: createMuiAdapter({ moduleLoader }),
		nextYak,
		createPandaAdapter({ moduleLoader: moduleLoader ?? null }),
		moduleLoader === undefined
			? createTailwindAdapter({ moduleLoader: null, resolver: tailwindResolver })
			: createTailwindAdapter({ moduleLoader }),
		jss,
		stylex,
		fela,
		goober,
		aphrodite,
		style9,
		treat,
		compiled,
		solidStyled,
		vueStyled,
		reactNative,
		moduleLoader === undefined
			? createTokenamiAdapter({ moduleLoader: null })
			: createTokenamiAdapter({ moduleLoader }),
		moduleLoader === undefined
			? createUnoCssAdapter({ moduleLoader: null })
			: createUnoCssAdapter({ moduleLoader }),
		authoredCssAdapter,
		cssModulesAdapter,
		moduleLoader === undefined ? sassAdapter : createSassAdapter(moduleLoader),
		moduleLoader === undefined ? lessAdapter : createLessAdapter(moduleLoader),
		moduleLoader === undefined
			? createTamaguiAdapter({ moduleLoader: null })
			: createTamaguiAdapter({ moduleLoader }),
	];
	return createStyleAdapterPlugin(
		CodemodPluginId.BuiltinAdapters,
		adapters.map((adapter) => withProjectFileReader(adapter, readFile)),
	);
}
