/** Built-in adapter catalog. Concrete policy lives beside each adapter. */
import { APHRODITE } from "./adapters/aphrodite.adapter.ts";
import { COMPILED } from "./adapters/compiled.adapter.ts";
import { FELA } from "./adapters/fela.adapter.ts";
import { GOOBER } from "./adapters/goober.adapter.ts";
import { REACT_NATIVE } from "./adapters/react-native.adapter.ts";
import { SOLID_STYLED } from "./adapters/solid-styled.adapter.ts";
import { STYLE9 } from "./adapters/style9.adapter.ts";
import { TREAT } from "./adapters/treat.adapter.ts";
import { VUE_STYLED } from "./adapters/vue-styled.adapter.ts";

export { APHRODITE } from "./adapters/aphrodite.adapter.ts";
export { COMPILED } from "./adapters/compiled.adapter.ts";
export { FELA } from "./adapters/fela.adapter.ts";
export { GOOBER } from "./adapters/goober.adapter.ts";
export { REACT_NATIVE } from "./adapters/react-native.adapter.ts";
export { SOLID_STYLED } from "./adapters/solid-styled.adapter.ts";
export { STYLE9 } from "./adapters/style9.adapter.ts";
export { TREAT } from "./adapters/treat.adapter.ts";
export { VUE_STYLED } from "./adapters/vue-styled.adapter.ts";

export const EXTRA_ADAPTERS = [
	FELA,
	GOOBER,
	APHRODITE,
	STYLE9,
	TREAT,
	COMPILED,
	SOLID_STYLED,
	VUE_STYLED,
	REACT_NATIVE,
] as const;
