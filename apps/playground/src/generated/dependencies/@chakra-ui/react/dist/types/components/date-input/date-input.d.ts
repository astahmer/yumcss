// Generated from the workspace-linked pandwind package. Do not edit.
import type { Assign } from "@ark-ui/react";
import { DateInput as ArkDateInput } from "@ark-ui/react/date-input";
import { type HTMLChakraProps, type SlotRecipeProps, type UnstyledProp } from "../../styled-system.d.ts";
declare const useDateInputStyles: () => Record<string, import("../...d.ts").SystemStyleObject>;
export { useDateInputStyles };
export interface DateInputRootProviderBaseProps extends Assign<ArkDateInput.RootProviderBaseProps, SlotRecipeProps<"dateInput">>, UnstyledProp {
}
export interface DateInputRootProviderProps extends HTMLChakraProps<"div", DateInputRootProviderBaseProps> {
}
export declare const DateInputRootProvider: import("react").ForwardRefExoticComponent<DateInputRootProviderProps & import("react").RefAttributes<HTMLDivElement>>;
export interface DateInputRootBaseProps extends Assign<ArkDateInput.RootBaseProps, SlotRecipeProps<"dateInput">>, UnstyledProp {
}
export interface DateInputRootProps extends HTMLChakraProps<"div", DateInputRootBaseProps> {
}
export declare const DateInputRoot: import("react").ForwardRefExoticComponent<DateInputRootProps & import("react").RefAttributes<HTMLDivElement>>;
export declare const DateInputPropsProvider: React.Provider<ArkDateInput.RootBaseProps>;
export interface DateInputLabelProps extends HTMLChakraProps<"label", ArkDateInput.LabelBaseProps>, UnstyledProp {
}
export declare const DateInputLabel: import("react").ForwardRefExoticComponent<DateInputLabelProps & import("react").RefAttributes<HTMLLabelElement>>;
export interface DateInputControlProps extends HTMLChakraProps<"div", ArkDateInput.ControlBaseProps>, UnstyledProp {
}
export declare const DateInputControl: import("react").ForwardRefExoticComponent<DateInputControlProps & import("react").RefAttributes<HTMLDivElement>>;
export interface DateInputSegmentGroupProps extends HTMLChakraProps<"div", ArkDateInput.SegmentGroupBaseProps>, UnstyledProp {
}
export declare const DateInputSegmentGroup: import("react").ForwardRefExoticComponent<DateInputSegmentGroupProps & import("react").RefAttributes<HTMLDivElement>>;
export interface DateInputSegmentProps extends HTMLChakraProps<"span", ArkDateInput.SegmentBaseProps>, UnstyledProp {
}
export declare const DateInputSegment: import("react").ForwardRefExoticComponent<DateInputSegmentProps & import("react").RefAttributes<HTMLSpanElement>>;
export interface DateInputHiddenInputProps extends HTMLChakraProps<"input", ArkDateInput.HiddenInputBaseProps>, UnstyledProp {
}
export declare const DateInputHiddenInput: import("react").ForwardRefExoticComponent<DateInputHiddenInputProps & import("react").RefAttributes<HTMLInputElement>>;
export interface DateInputSegmentsProps extends Omit<DateInputSegmentGroupProps, "children" | "index"> {
    /**
     * The index of the date value. Useful when `selectionMode` is `range`.
     */
    index?: number;
}
export declare const DateInputSegments: (props: DateInputSegmentsProps) => import("react").JSX.Element;
