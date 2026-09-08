import { CSS_BACKEND } from "./css.ts";
import { OBJECT_BACKEND } from "./object-engine.ts";
import { OPENTUI_BACKEND } from "./opentui.ts";
import { REACT_NATIVE_BACKEND } from "./react-native.ts";
import { REACT_STRICT_DOM_BACKEND } from "./react-strict-dom.ts";
import type { StyleBackendFactory } from "./registry.ts";

export const BUILTIN_STYLE_BACKEND_FACTORIES: readonly StyleBackendFactory[] = [
	CSS_BACKEND,
	OBJECT_BACKEND,
	REACT_NATIVE_BACKEND,
	REACT_STRICT_DOM_BACKEND,
	OPENTUI_BACKEND,
];
