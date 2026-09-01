// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseSignaturePadReturn } from './use-signature-pad.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseSignaturePadReturn;
}
export interface SignaturePadRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface SignaturePadRootProviderProps extends HTMLProps<'div'>, SignaturePadRootProviderBaseProps {
}
export declare const SignaturePadRootProvider: ForwardRefExoticComponent<SignaturePadRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
