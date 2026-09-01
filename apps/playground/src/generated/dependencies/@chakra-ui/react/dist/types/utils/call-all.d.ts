// Generated from the workspace-linked pandwind package. Do not edit.
import type { AnyFunction } from "./types.d.ts";
export declare function callAll<T extends AnyFunction>(...fns: (T | undefined)[]): (...args: Parameters<T>) => void;
