// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseFieldReturn } from './use-field.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseFieldReturn;
}
export interface FieldRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface FieldRootProviderProps extends HTMLProps<'div'>, FieldRootProviderBaseProps {
}
export declare const FieldRootProvider: ForwardRefExoticComponent<FieldRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
