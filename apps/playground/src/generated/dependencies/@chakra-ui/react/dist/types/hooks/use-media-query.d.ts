// Generated from the workspace-linked pandwind package. Do not edit.
export interface UseMediaQueryOptions {
    fallback?: boolean[] | undefined;
    ssr?: boolean | undefined;
    getWindow?(): typeof window;
}
export declare function useMediaQuery(query: string[], options?: UseMediaQueryOptions): boolean[];
