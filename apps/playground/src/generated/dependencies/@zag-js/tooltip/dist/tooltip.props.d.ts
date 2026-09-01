// Generated from the workspace-linked pandwind package. Do not edit.
import { TooltipProps } from './tooltip.types.d.ts';
import '@zag-js/core';
import '@zag-js/popper';
import '@zag-js/types';

declare const props: (keyof TooltipProps)[];
declare const splitProps: <Props extends Partial<TooltipProps>>(props: Props) => [Partial<TooltipProps>, Omit<Props, keyof TooltipProps>];

export { props, splitProps };
