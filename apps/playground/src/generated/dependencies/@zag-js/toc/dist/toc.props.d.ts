// Generated from the workspace-linked pandwind package. Do not edit.
import { TocProps, ItemProps } from './toc.types.d.ts';
import '@zag-js/core';
import '@zag-js/types';

declare const props: (keyof TocProps)[];
declare const splitProps: <Props extends Partial<TocProps>>(props: Props) => [Partial<TocProps>, Omit<Props, keyof TocProps>];
declare const itemProps: "item"[];
declare const splitItemProps: <Props extends ItemProps>(props: Props) => [ItemProps, Omit<Props, "item">];

export { itemProps, props, splitItemProps, splitProps };
