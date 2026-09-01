// Generated from the workspace-linked pandwind package. Do not edit.
import { PopoverProps } from './popover.types.d.ts';
import '@zag-js/core';
import '@zag-js/dismissable';
import '@zag-js/popper';
import '@zag-js/types';

declare const props: (keyof PopoverProps)[];
declare const splitProps: <Props extends Partial<PopoverProps>>(props: Props) => [Partial<PopoverProps>, Omit<Props, keyof PopoverProps>];

export { props, splitProps };
