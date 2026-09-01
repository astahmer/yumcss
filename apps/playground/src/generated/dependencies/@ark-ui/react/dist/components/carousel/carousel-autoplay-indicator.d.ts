// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface CarouselAutoplayIndicatorBaseProps extends PolymorphicProps {
    /**
     * The fallback content to render when autoplay is paused.
     */
    fallback?: React.ReactNode;
}
export interface CarouselAutoplayIndicatorProps extends HTMLProps<'span'>, CarouselAutoplayIndicatorBaseProps {
}
export declare const CarouselAutoplayIndicator: ForwardRefExoticComponent<CarouselAutoplayIndicatorProps & RefAttributes<HTMLSpanElement>>;
