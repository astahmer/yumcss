// Generated from the workspace-linked pandwind package. Do not edit.
import { InlineStylesInput } from './styles-to-string/styles-to-string.d.ts';
export interface InlineStylesProps extends InlineStylesInput, Omit<React.ComponentProps<'style'>, keyof InlineStylesInput> {
    deduplicate?: boolean;
}
export declare function InlineStyles({ deduplicate, ...props }: InlineStylesProps): import("react/jsx-runtime").JSX.Element;
