// Generated from the workspace-linked pandwind package. Do not edit.
import { ProgressProps } from './progress.types.d.ts';
import '@zag-js/core';
import '@zag-js/types';

declare const props: (keyof ProgressProps)[];
declare const splitProps: <Props extends Partial<ProgressProps>>(props: Props) => [Partial<ProgressProps>, Omit<Props, keyof ProgressProps>];

export { props, splitProps };
