/**
 * Shared class constants — the cross-module constant-propagation demo.
 *
 * The vite cx pass resolves imported string constants (one barrel level
 * deep, un-shadowed, never written) and folds them into cx() calls at build
 * time, exactly like same-module literals.
 */
export const CARD_BASE = "mx-auto max-w-md rounded-xl border shadow-sm";
export const MUTED_TEXT = "text-sm leading-6 text-gray-600 dark:text-gray-300";
