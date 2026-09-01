// Generated from the workspace-linked pandwind package. Do not edit.
import type { DesignPreset, DesignStyleObject } from "../design/types.d.ts";
import type { StyleObject } from "../types/typings.d.ts";
import type { ObjectBackend, TargetStyle } from "./object-engine.d.ts";
export interface ObjectCssFn<TStyles extends StyleObject = StyleObject> {
    (...styles: Array<TStyles | undefined | null | false>): TargetStyle;
    raw: (...styles: Array<TStyles | undefined | null | false>) => StyleObject;
}
export declare function createObjectCss<TStyles extends StyleObject = StyleObject>(backend: ObjectBackend): ObjectCssFn<TStyles>;
export interface ObjectCxFn {
    (...inputs: Array<TargetStyle | undefined | null | false | Array<TargetStyle | undefined | null | false>>): TargetStyle;
}
export declare function createObjectCx(backend: ObjectBackend): ObjectCxFn;
export declare function createDesignObjectCss<TPreset extends DesignPreset>(preset: TPreset, backend: ObjectBackend): ObjectCssFn<DesignStyleObject<TPreset>>;
