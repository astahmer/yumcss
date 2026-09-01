// Generated from the workspace-linked pandwind package. Do not edit.
import { CheckboxProps } from './checkbox.types.d.ts';
import '@zag-js/types';
import '@zag-js/core';

declare const props: (keyof CheckboxProps)[];
declare const splitProps: <Props extends Partial<CheckboxProps>>(props: Props) => [Partial<CheckboxProps>, Omit<Props, keyof CheckboxProps>];

export { props, splitProps };
