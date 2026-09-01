// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseScrollAreaReturn } from './use-scroll-area.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseScrollAreaReturn;
}
export interface ScrollAreaRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface ScrollAreaRootProviderProps extends HTMLProps<'div'>, ScrollAreaRootProviderBaseProps {
}
export declare const ScrollAreaRootProvider: ForwardRefExoticComponent<ScrollAreaRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
