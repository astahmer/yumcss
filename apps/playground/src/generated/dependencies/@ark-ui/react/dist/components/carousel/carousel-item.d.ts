// Generated from the workspace-linked pandwind package. Do not edit.
import { ItemProps } from '@zag-js/carousel';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface CarouselItemBaseProps extends ItemProps, PolymorphicProps {
}
export interface CarouselItemProps extends HTMLProps<'div'>, CarouselItemBaseProps {
}
export declare const CarouselItem: ForwardRefExoticComponent<CarouselItemProps & RefAttributes<HTMLDivElement>>;
