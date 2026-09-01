// Generated from the workspace-linked pandwind package. Do not edit.
export declare function mapEntries<A, B, K extends string>(obj: {
    [key in K]: A;
}, f: (key: K, val: A) => [K, B]): {
    [key in K]: B;
};
