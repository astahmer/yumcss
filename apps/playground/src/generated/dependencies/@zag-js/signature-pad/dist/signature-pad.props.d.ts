// Generated from the workspace-linked pandwind package. Do not edit.
import { SignaturePadProps } from './signature-pad.types.d.ts';
import '@zag-js/core';
import '@zag-js/types';
import 'perfect-freehand';

declare const props: (keyof SignaturePadProps)[];
declare const splitProps: <Props extends Partial<SignaturePadProps>>(props: Props) => [Partial<SignaturePadProps>, Omit<Props, keyof SignaturePadProps>];

export { props, splitProps };
