// Generated from the workspace-linked pandwind package. Do not edit.
import { Color } from './color.d.ts';
import { ColorChannel } from './types.d.ts';

interface GradientOptions {
    xChannel: ColorChannel;
    yChannel: ColorChannel;
    dir?: "rtl" | "ltr" | undefined;
}
interface GradientStyles {
    areaStyles: Record<string, string>;
    areaGradientStyles: Record<string, string>;
}
declare function getColorAreaGradient(color: Color, options: GradientOptions): GradientStyles;

export { getColorAreaGradient };
