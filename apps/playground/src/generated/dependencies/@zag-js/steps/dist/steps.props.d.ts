// Generated from the workspace-linked pandwind package. Do not edit.
import { StepsProps } from './steps.types.d.ts';
import '@zag-js/core';
import '@zag-js/types';

declare const props: (keyof StepsProps)[];
declare const splitProps: <Props extends Partial<StepsProps>>(props: Props) => [Partial<StepsProps>, Omit<Props, keyof StepsProps>];

export { props, splitProps };
