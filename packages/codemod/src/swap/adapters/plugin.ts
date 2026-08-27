import { createStyleAdapterPlugin, type StyleAdapterPlugin } from "../adapter-registry.ts";
import aphrodite from "./aphrodite.adapter.ts";
import compiled from "./compiled.adapter.ts";
import emotion from "./emotion.adapter.ts";
import fela from "./fela.adapter.ts";
import goober from "./goober.adapter.ts";
import jss from "./jss.adapter.ts";
import linaria from "./linaria.adapter.ts";
import pandwind from "./pandwind.adapter.ts";
import reactNative from "./react-native.adapter.ts";
import solidStyled from "./solid-styled.adapter.ts";
import stitches from "./stitches.adapter.ts";
import style9 from "./style9.adapter.ts";
import stylex from "./stylex.adapter.ts";
import styledComponents from "./styled-components.adapter.ts";
import treat from "./treat.adapter.ts";
import vanillaExtract from "./vanilla-extract.adapter.ts";
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
