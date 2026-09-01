// Generated from the workspace-linked pandwind package. Do not edit.
import { type ObjectBackend, type ObjectBackendOptions } from "./object.d.ts";
import type { StyleBackendFactory } from "./registry.d.ts";
export interface OpentuiBackendOptions extends Omit<ObjectBackendOptions, "name" | "capabilities" | "convert"> {
    readonly name?: string;
    readonly cellSize?: number;
}
export declare function createOpentuiBackend(options?: OpentuiBackendOptions): ObjectBackend;
export declare const OPENTUI_BACKEND: StyleBackendFactory<OpentuiBackendOptions, Record<string, unknown>>;
