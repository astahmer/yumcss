// Generated from the workspace-linked pandwind package. Do not edit.
export declare const createHashFn: (debug: boolean) => (key: string, value: string) => string;
export declare function dashCase(string: string): string;
/**
 * Escape a name for use as a CSS identifier (class name or custom property).
 * A leading digit must be hex-escaped: `.\\32 mprtg` === class "2mprtg".
 */
export declare const escapeIdentifier: (name: string) => string;
export declare const hashCssVar: (key: string, debug?: boolean) => string;
