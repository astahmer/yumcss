// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseSwapReturn } from './use-swap.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface SwapRootProviderBaseProps extends PolymorphicProps {
    value: UseSwapReturn;
}
export interface SwapRootProviderProps extends HTMLProps<'span'>, SwapRootProviderBaseProps {
}
export declare const SwapRootProvider: ForwardRefExoticComponent<SwapRootProviderProps & RefAttributes<HTMLSpanElement>>;
