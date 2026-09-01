// Generated from the workspace-linked pandwind package. Do not edit.
import { type HTMLChakraProps, type SlotRecipeProps, type UnstyledProp } from "../../styled-system.d.ts";
declare const useListStyles: () => Record<string, import("../...d.ts").SystemStyleObject>;
export { useListStyles };
export interface ListRootBaseProps extends SlotRecipeProps<"list">, UnstyledProp {
}
export interface ListRootProps extends HTMLChakraProps<"ul", ListRootBaseProps> {
}
export declare const ListRoot: import("react").ForwardRefExoticComponent<ListRootProps & import("react").RefAttributes<HTMLUListElement>>;
export declare const ListRootPropsProvider: React.Provider<ListRootBaseProps>;
export interface ListItemProps extends HTMLChakraProps<"li">, UnstyledProp {
}
export declare const ListItem: import("react").ForwardRefExoticComponent<ListItemProps & import("react").RefAttributes<HTMLLIElement>>;
export interface ListIndicatorProps extends HTMLChakraProps<"span">, UnstyledProp {
}
export declare const ListIndicator: import("react").ForwardRefExoticComponent<ListIndicatorProps & import("react").RefAttributes<HTMLSpanElement>>;
