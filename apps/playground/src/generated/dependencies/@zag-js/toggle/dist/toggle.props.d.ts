// Generated from the workspace-linked pandwind package. Do not edit.
import { ToggleProps } from './toggle.types.d.ts';
import '@zag-js/core';
import '@zag-js/types';

declare const props: (keyof ToggleProps)[];
declare const splitProps: <Props extends Partial<ToggleProps>>(props: Props) => [Partial<ToggleProps>, Omit<Props, keyof ToggleProps>];

export { props, splitProps };
