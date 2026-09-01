// Generated from the workspace-linked pandwind package. Do not edit.
import { CollapsibleProps } from './collapsible.types.d.ts';
import '@zag-js/core';
import '@zag-js/types';

declare const props: (keyof CollapsibleProps)[];
declare const splitProps: <Props extends Partial<CollapsibleProps>>(props: Props) => [Partial<CollapsibleProps>, Omit<Props, keyof CollapsibleProps>];

export { props, splitProps };
