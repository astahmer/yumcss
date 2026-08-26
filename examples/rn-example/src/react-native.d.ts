/**
 * Local type shim: react-native-web ships flow types only, and installing
 * @types/react-native is out of scope here. Source imports say
 * "react-native" (real RN app shape); vite resolves them to
 * react-native-web at runtime. Only the surface this app consumes is
 * declared — styles stay `unknown`-permissive because validating their
 * SHAPE is pandwind's job, asserted end-to-end by test/e2e.mjs.
 */
declare module "react-dom/client" {
	import type { ReactNode } from "react";

	export interface Root {
		render(node: ReactNode): void;
	}
	export function createRoot(container: Element | DocumentFragment): Root;
}

declare module "react-native" {
	import type { ReactNode } from "react";

	export type StyleProp = unknown | Array<unknown>;

	export interface ViewProps {
		style?: StyleProp;
		testID?: string;
		children?: ReactNode;
		onClick?: () => void;
	}

	export interface TextProps {
		style?: StyleProp;
		testID?: string;
		children?: ReactNode;
	}

	export interface PressableProps {
		style?: StyleProp;
		testID?: string;
		onPress?: () => void;
		children?: ReactNode;
	}

	export function View(props: ViewProps): JSX.Element;
	export function Text(props: TextProps): JSX.Element;
	export function Pressable(props: PressableProps): JSX.Element;
}
