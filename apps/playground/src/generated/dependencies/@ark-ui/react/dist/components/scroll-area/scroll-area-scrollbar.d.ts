// Generated from the workspace-linked pandwind package. Do not edit.
import { Orientation } from '@zag-js/types';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface ScrollbarProps {
    orientation?: Orientation;
}
export interface ScrollAreaScrollbarBaseProps extends ScrollbarProps, PolymorphicProps {
}
export interface ScrollAreaScrollbarProps extends HTMLProps<'div'>, ScrollAreaScrollbarBaseProps {
}
export declare const ScrollAreaScrollbar: ForwardRefExoticComponent<ScrollAreaScrollbarProps & RefAttributes<HTMLDivElement>>;
export {};
