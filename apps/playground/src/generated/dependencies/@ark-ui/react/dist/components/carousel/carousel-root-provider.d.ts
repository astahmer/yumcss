// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseCarouselReturn } from './use-carousel.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseCarouselReturn;
}
export interface CarouselRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface CarouselRootProviderProps extends HTMLProps<'div'>, CarouselRootProviderBaseProps {
}
export declare const CarouselRootProvider: ForwardRefExoticComponent<CarouselRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
