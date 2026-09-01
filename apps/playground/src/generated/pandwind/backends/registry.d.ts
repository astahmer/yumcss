// Generated from the workspace-linked pandwind package. Do not edit.
import { STYLE_BACKEND_SCHEMA, type StyleBackend, type StyleBackendId } from "./types.d.ts";
import type { BackendCapabilityContract } from "./types.d.ts";
export { STYLE_BACKEND_SCHEMA } from "./types.d.ts";
export interface StyleBackendFactory<TOptions = unknown, TArtifact = unknown> {
    readonly schema: typeof STYLE_BACKEND_SCHEMA;
    readonly id: string;
    readonly capabilities: BackendCapabilityContract;
    create(options?: TOptions): StyleBackend<TArtifact>;
}
export interface StyleBackendPlugin<TOptions = unknown, TArtifact = unknown> extends StyleBackendFactory<TOptions, TArtifact> {
}
export interface StyleBackendRegistry {
    readonly plugins: readonly StyleBackendPlugin[];
    readonly factories: readonly StyleBackendFactory[];
    register(factory: StyleBackendFactory): StyleBackendRegistry;
    registerPlugin(plugin: StyleBackendPlugin): StyleBackendRegistry;
    get(id: string): StyleBackendFactory | undefined;
    create<TArtifact = unknown>(id: string, options?: unknown): StyleBackend<TArtifact>;
}
export declare function createStyleBackendRegistry(initial?: readonly StyleBackendFactory[]): StyleBackendRegistry;
export type BuiltinBackendId = StyleBackendId;
/** Built-ins are composed here; individual adapters do not know the registry. */
export declare const STYLE_BACKEND_FACTORIES: readonly StyleBackendFactory[];
export declare const STYLE_BACKEND_PLUGINS: readonly StyleBackendPlugin[];
export declare const STYLE_BACKENDS: StyleBackendRegistry;
