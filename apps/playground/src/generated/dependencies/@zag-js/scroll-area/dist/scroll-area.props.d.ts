// Generated from the workspace-linked pandwind package. Do not edit.
import { ScrollAreaProps } from './scroll-area.types.d.ts';
import '@zag-js/core';
import '@zag-js/types';
import './utils/timeout.d.ts';

declare const props: (keyof ScrollAreaProps)[];
declare const splitProps: <Props extends Partial<ScrollAreaProps>>(props: Props) => [Partial<ScrollAreaProps>, Omit<Props, keyof ScrollAreaProps>];

export { props, splitProps };
