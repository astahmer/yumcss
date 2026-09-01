// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseEditableReturn } from './use-editable.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseEditableReturn;
}
export interface EditableRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface EditableRootProviderProps extends HTMLProps<'div'>, EditableRootProviderBaseProps {
}
export declare const EditableRootProvider: ForwardRefExoticComponent<EditableRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
