// Generated from the workspace-linked pandwind package. Do not edit.
import type { ClassNameStrategy } from "./class-name-strategy.d.ts";
export interface StyleXAdapterOptions {
    /** StyleX's default class prefix is `x`. */
    readonly classNamePrefix?: string;
    /** Match StyleX's readable debug prefix when debugging is enabled. */
    readonly debug?: boolean;
    readonly enableDebugClassNames?: boolean;
    /** Resolved semantic condition selectors/at-rules from the active preset. */
    readonly conditions?: Readonly<Record<string, string | readonly string[]>>;
}
/**
 * Emit StyleX-compatible atomic class identities for Pandwind's stylesheet.
 *
 * The hash follows StyleX's stable atomic formula: dashed property, normalized
 * value, sorted condition modifier, and the `<>` compatibility marker. The
 * generated CSS remains Pandwind-owned (`sheetBacked: true`), so this adapter
 * is useful when a project wants StyleX-shaped classes without shipping the
 * StyleX runtime or changing its source API.
 *
 * Condition metadata is intentionally injected rather than guessed. Without
 * it, semantic condition names still produce deterministic valid class names;
 * with it, selectors and at-rules participate in the same identity input as
 * StyleX. Custom conditions therefore work without another hardcoded catalog.
 */
export declare const createStyleXAdapter: (options?: StyleXAdapterOptions) => ClassNameStrategy;
