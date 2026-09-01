// Generated from the workspace-linked pandwind package. Do not edit.
import type { SystemContext } from "./types.d.ts";
declare const useChakraContext: () => SystemContext;
export interface ChakraProviderProps {
    value: SystemContext;
    children: React.ReactNode;
}
declare function ChakraProvider(props: ChakraProviderProps): import("react").JSX.Element;
export { ChakraProvider, useChakraContext };
