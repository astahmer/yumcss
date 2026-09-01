// Generated from the workspace-linked pandwind package. Do not edit.
import { HoverCardProps } from './hover-card.types.d.ts';
import '@zag-js/core';
import '@zag-js/dismissable';
import '@zag-js/popper';
import '@zag-js/types';

declare const props: (keyof HoverCardProps)[];
declare const splitProps: <Props extends Partial<HoverCardProps>>(props: Props) => [Partial<HoverCardProps>, Omit<Props, keyof HoverCardProps>];

export { props, splitProps };
