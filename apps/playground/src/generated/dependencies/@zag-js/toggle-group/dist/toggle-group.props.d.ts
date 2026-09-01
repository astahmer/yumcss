// Generated from the workspace-linked pandwind package. Do not edit.
import { ItemProps, ToggleGroupProps } from './toggle-group.types.d.ts';
import '@zag-js/core';
import '@zag-js/types';

declare const props: (keyof ToggleGroupProps)[];
declare const splitProps: <Props extends Partial<ToggleGroupProps>>(props: Props) => [Partial<ToggleGroupProps>, Omit<Props, keyof ToggleGroupProps>];
declare const itemProps: (keyof ItemProps)[];
declare const splitItemProps: <Props extends ItemProps>(props: Props) => [ItemProps, Omit<Props, keyof ItemProps>];

export { itemProps, props, splitItemProps, splitProps };
