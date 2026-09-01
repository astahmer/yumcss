// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseFieldsetReturn } from './use-fieldset.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseFieldsetReturn;
}
export interface FieldsetRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface FieldsetRootProviderProps extends HTMLProps<'fieldset'>, FieldsetRootProviderBaseProps {
}
export declare const FieldsetRootProvider: ForwardRefExoticComponent<FieldsetRootProviderProps & RefAttributes<HTMLFieldSetElement>>;
export {};
