// Generated from the workspace-linked pandwind package. Do not edit.
import type { CssVariable } from '../../../Box.d.ts';
import type { MantineColorScheme, MantineColorShade, MantineTheme } from '../../theme.types.d.ts';
interface ParseThemeColorOptions {
    color: unknown;
    theme: MantineTheme;
    colorScheme?: MantineColorScheme;
}
interface ParseThemeColorResult {
    color: string;
    value: string;
    shade: MantineColorShade | undefined;
    variable: CssVariable | undefined;
    isThemeColor: boolean;
    isLight: boolean;
}
export declare function parseThemeColor({ color, theme, colorScheme, }: ParseThemeColorOptions): ParseThemeColorResult;
export {};
