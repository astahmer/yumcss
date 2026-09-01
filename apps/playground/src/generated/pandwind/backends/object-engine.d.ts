// Generated from the workspace-linked pandwind package. Do not edit.
import type { StyleObject } from "../types/typings.d.ts";
import { type BackendCapabilityContract, type StyleBackend } from "./types.d.ts";
import type { StyleBackendFactory } from "./registry.d.ts";
/** A target style object: camelCase props, target-native values. */
export type TargetStyle = Record<string, unknown>;
export interface ObjectBackendOptions {
    readonly name: string;
    readonly capabilities?: BackendCapabilityContract;
    readonly conditions?: Record<string, () => boolean>;
    readonly convert?: (prop: string, value: string) => Record<string, unknown>;
}
export type ObjectBackend = StyleBackend<TargetStyle> & {
    resolve(style: StyleObject): TargetStyle;
    merge(...styles: Array<TargetStyle>): TargetStyle;
};
export declare function createObjectBackend(options: ObjectBackendOptions): ObjectBackend;
export declare const OBJECT_BACKEND: StyleBackendFactory<ObjectBackendOptions, TargetStyle>;
