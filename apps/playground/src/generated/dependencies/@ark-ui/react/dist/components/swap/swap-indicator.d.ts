// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface SwapIndicatorBaseProps extends PolymorphicProps {
    type: 'on' | 'off';
}
export interface SwapIndicatorProps extends HTMLProps<'span'>, SwapIndicatorBaseProps {
}
export declare const SwapIndicator: ForwardRefExoticComponent<SwapIndicatorProps & RefAttributes<HTMLSpanElement>>;
