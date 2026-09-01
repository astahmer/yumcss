// Generated from the workspace-linked pandwind package. Do not edit.
import { type HTMLChakraProps, type RecipeProps, type UnstyledProp } from "../../styled-system.d.ts";
export interface KbdBaseProps extends RecipeProps<"kbd">, UnstyledProp {
}
export interface KbdProps extends HTMLChakraProps<"kbd", KbdBaseProps> {
}
export declare const Kbd: import("react").ForwardRefExoticComponent<KbdProps & import("react").RefAttributes<HTMLElement>>;
export declare const KbdPropsProvider: React.Provider<KbdProps>;
