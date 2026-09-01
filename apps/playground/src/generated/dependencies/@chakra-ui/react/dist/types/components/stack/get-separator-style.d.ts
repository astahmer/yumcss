// Generated from the workspace-linked pandwind package. Do not edit.
import type { ConditionalValue, SystemStyleObject } from "../../styled-system.d.ts";
export type StackDirection = ConditionalValue<"row" | "column" | "row-reverse" | "column-reverse">;
interface Options {
    gap: SystemStyleObject["gap"];
    direction: StackDirection;
}
export declare function getSeparatorStyles(options: Options): {
    "&": any;
};
export {};
