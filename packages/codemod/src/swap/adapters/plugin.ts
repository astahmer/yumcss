import { createStyleAdapterPlugin, type StyleAdapterPlugin } from "../adapter-registry.ts";
import aphrodite from "./aphrodite.adapter.ts";
import compiled from "./compiled.adapter.ts";
import emotion from "./emotion-definition.ts";
import fela from "./fela.adapter.ts";
import goober from "./goober.adapter.ts";
import jss from "./jss-definition.ts";
import linaria from "./linaria-definition.ts";
import pandwind from "./pandwind-definition.ts";
import reactNative from "./react-native.adapter.ts";
import solidStyled from "./solid-styled.adapter.ts";
import stitches from "./stitches-definition.ts";
import style9 from "./style9.adapter.ts";
import stylex from "./stylex-definition.ts";
import styledComponents from "./styled-components-definition.ts";
import treat from "./treat.adapter.ts";
import vanillaExtract from "./vanilla-extract-definition.ts";
import vueStyled from "./vue-styled.adapter.ts";

/** The built-in set is a composition root; adapter modules remain opaque to callers. */
export const BUILTIN_ADAPTER_PLUGIN: StyleAdapterPlugin = createStyleAdapterPlugin(
	"pandwind-builtin-adapters",
	[
		pandwind,
		emotion,
		styledComponents,
		vanillaExtract,
		stitches,
		linaria,
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
	],
);
