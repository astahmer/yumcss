// Generated from the workspace-linked pandwind package. Do not edit.
type Values = Set<string | true>;
export type UtilityMap = Map<string, Values>;
export declare function getFunctionalTypes(system: {
    utilities: {
        keys: (kind: "functional" | "static") => string[];
        getCompletions: (name: string) => unknown[];
    };
}): UtilityMap;
export declare function longestFunctionalPrefix(candidate: string, functional: string[]): string | undefined;
export declare class TailwindUtilityCatalog {
    collect(system: Parameters<typeof getFunctionalTypes>[0]): UtilityMap;
    expand(types: UtilityMap, conflicts: Record<string, Record<string, string[]>>): void;
}
export {};
