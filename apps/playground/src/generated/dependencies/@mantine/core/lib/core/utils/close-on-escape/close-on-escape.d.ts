// Generated from the workspace-linked pandwind package. Do not edit.
interface Options {
    active: boolean | undefined;
    onTrigger?: () => void;
    onKeyDown?: (event: React.KeyboardEvent<any>) => void;
}
export declare function closeOnEscape(callback?: (event: any) => void, options?: Options): (event: React.KeyboardEvent<any>) => void;
export {};
