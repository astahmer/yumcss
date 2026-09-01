// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseAngleSliderReturn } from './use-angle-slider.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseAngleSliderReturn;
}
export interface AngleSliderRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface AngleSliderRootProviderProps extends HTMLProps<'div'>, AngleSliderRootProviderBaseProps {
}
export declare const AngleSliderRootProvider: ForwardRefExoticComponent<AngleSliderRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
