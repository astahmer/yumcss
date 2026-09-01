// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseMarqueeReturn } from './use-marquee.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseMarqueeReturn;
}
export interface MarqueeRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface MarqueeRootProviderProps extends HTMLProps<'div'>, MarqueeRootProviderBaseProps {
}
export declare const MarqueeRootProvider: ForwardRefExoticComponent<MarqueeRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
