// Generated from the workspace-linked pandwind package. Do not edit.
import { SwitchProps } from './switch.types.d.ts';
import '@zag-js/core';
import '@zag-js/types';

declare const props: (keyof SwitchProps)[];
declare const splitProps: <Props extends Partial<SwitchProps>>(props: Props) => [Partial<SwitchProps>, Omit<Props, keyof SwitchProps>];

export { props, splitProps };
