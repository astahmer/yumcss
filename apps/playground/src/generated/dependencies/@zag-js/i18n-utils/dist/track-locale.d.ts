// Generated from the workspace-linked pandwind package. Do not edit.
import { Locale } from './locale.d.ts';

interface LocaleOptions {
    locale?: string | undefined;
    getRootNode?: (() => ShadowRoot | Document | Node) | undefined;
    onLocaleChange?: ((locale: Locale) => void) | undefined;
}
declare function trackLocale(options?: LocaleOptions): () => void;

export { type LocaleOptions, trackLocale };
