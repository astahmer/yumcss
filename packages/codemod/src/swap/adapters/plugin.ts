import { createStyleAdapterPlugin, type StyleAdapterPlugin } from "../adapter-registry.ts";
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
import mantine from "./mantine.adapter.ts";
import mui from "./mui.adapter.ts";
import nextYak from "./next-yak.adapter.ts";
import pandwind from "./pandwind.adapter.ts";
import reactNative from "./react-native.adapter.ts";
import solidStyled from "./solid-styled.adapter.ts";
import stitches from "./stitches.adapter.ts";
import style9 from "./style9.adapter.ts";
import { createStyleXAdapter } from "./stylex.adapter.ts";
import styledComponents from "./styled-components.adapter.ts";
import treat from "./treat.adapter.ts";
import vanillaExtract from "./vanilla-extract.adapter.ts";
import vueStyled from "./vue-styled.adapter.ts";
import { createTokenamiAdapter } from "./tokenami.adapter.ts";
import { createUnoCssAdapter } from "./unocss.adapter.ts";

/** The built-in set is a composition root; adapter modules remain opaque to callers. */

export function createBuiltinAdapterPlugin(
	moduleLoader?: ProjectModuleLoader,
	stylexResolver?: StyleXImportedReferenceResolver,
): StyleAdapterPlugin {
	const stylex = createStyleXAdapter({ crossModuleResolver: stylexResolver });
	return createStyleAdapterPlugin(CodemodPluginId.BuiltinAdapters, [
		pandwind,
		bamboo,
		moduleLoader === undefined
			? createChakraAdapter({ moduleLoader: null })
			: createChakraAdapter({ moduleLoader }),
		emotion,
		styledComponents,
		vanillaExtract,
		stitches,
		linaria,
		mantine,
		mui,
		nextYak,
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
	]);
}

export const BUILTIN_ADAPTER_PLUGIN: StyleAdapterPlugin = createBuiltinAdapterPlugin();
