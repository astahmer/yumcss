import {
	createCx as createOpenTuiCx,
	createDesignCss as createOpenTuiDesignCss,
} from "pandwind/opentui";
import {
	createCx as createReactNativeCx,
	createDesignCss as createReactNativeDesignCss,
} from "pandwind/react-native";
import {
	ReactStrictDomPlatform,
	createCss as createReactStrictDomCss,
	createCx as createReactStrictDomCx,
	createDesignCss as createReactStrictDomDesignCss,
} from "pandwind/react-strict-dom";
import { examplePreset } from "@pandwind/example-preset";

const nativeDesign = createReactNativeDesignCss(examplePreset);
const openTuiDesign = createOpenTuiDesignCss(examplePreset);
const nativeStyle = nativeDesign({ $frame: { fill: "$blue-500", pad: [4, 8] } });
const openTuiStyle = openTuiDesign({ $frame: { fill: "$blue-600", pad: 4 } });
const nativeCx = createReactNativeCx()(nativeStyle);
const openTuiCx = createOpenTuiCx()(openTuiStyle);

const webCss = createReactStrictDomCss();
const nativeCss = createReactStrictDomCss({ platform: ReactStrictDomPlatform.Native });
const namedWebStyles = webCss.create({
	card: { color: "red", padding: "1rem" },
	label: (color: string) => ({ color }),
});
const webStyle = webCss({ color: "red", padding: "1rem" });
const nativeRsdStyle = nativeCss({ color: "red", padding: 4 });
const rsdDesign = createReactStrictDomDesignCss(examplePreset);
const rsdCx = createReactStrictDomCx();
const rsdNativeCx = createReactStrictDomCx({ platform: ReactStrictDomPlatform.Native });

export const workload = {
	nativeCx,
	nativeRsdStyle,
	nativeStyle,
	openTuiCx,
	openTuiStyle,
	namedWebStyles,
	rsdCx: rsdCx(webStyle),
	rsdNativeCx: rsdNativeCx(nativeRsdStyle),
	rsdDesign: rsdDesign({ $frame: { fill: "$blue-500", pad: 4 } }),
	webStyle,
};
