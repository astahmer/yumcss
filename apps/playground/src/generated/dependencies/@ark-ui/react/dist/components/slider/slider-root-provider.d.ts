// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseSliderReturn } from './use-slider.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseSliderReturn;
}
export interface SliderRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface SliderRootProviderProps extends HTMLProps<'div'>, SliderRootProviderBaseProps {
}
export declare const SliderRootProvider: ForwardRefExoticComponent<SliderRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
