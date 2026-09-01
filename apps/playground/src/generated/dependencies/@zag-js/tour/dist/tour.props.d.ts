// Generated from the workspace-linked pandwind package. Do not edit.
import { TourProps } from './tour.types.d.ts';
import '@zag-js/core';
import '@zag-js/dismissable';
import '@zag-js/popper';
import '@zag-js/types';
import './utils/rect.d.ts';

declare const props: (keyof TourProps)[];
declare const splitProps: <Props extends Partial<TourProps>>(props: Props) => [Partial<TourProps>, Omit<Props, keyof TourProps>];

export { props, splitProps };
