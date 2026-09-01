// Generated from the workspace-linked pandwind package. Do not edit.
import { type HTMLChakraProps } from "../styled-system.d.ts";
export interface ThemeProps extends HTMLChakraProps<"div"> {
    /**
     * The appearance of the theme.
     */
    appearance?: "light" | "dark" | undefined;
    /**
     * Whether to apply the theme background and color.
     */
    hasBackground?: boolean | undefined;
}
export declare const Theme: import("react").ForwardRefExoticComponent<ThemeProps & import("react").RefAttributes<HTMLDivElement>>;
