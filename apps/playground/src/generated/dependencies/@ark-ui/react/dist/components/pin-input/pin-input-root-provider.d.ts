// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UsePinInputReturn } from './use-pin-input.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UsePinInputReturn;
}
export interface PinInputRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface PinInputRootProviderProps extends HTMLProps<'div'>, PinInputRootProviderBaseProps {
}
export declare const PinInputRootProvider: ForwardRefExoticComponent<PinInputRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
