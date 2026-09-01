// Generated from the workspace-linked pandwind package. Do not edit.
import { type ObjectBackend, type ObjectBackendOptions } from "./object.d.ts";
import type { StyleBackendFactory } from "./registry.d.ts";
export interface RnBackendOptions extends Omit<ObjectBackendOptions, "name" | "capabilities" | "convert"> {
    readonly name?: string;
}
export declare function createRnBackend(options?: RnBackendOptions): ObjectBackend;
export declare const REACT_NATIVE_BACKEND: StyleBackendFactory<RnBackendOptions, Record<string, unknown>>;
