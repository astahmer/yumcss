// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseEditableProps } from './use-editable.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface EditableRootBaseProps extends UseEditableProps, PolymorphicProps {
}
export interface EditableRootProps extends Assign<HTMLProps<'div'>, EditableRootBaseProps> {
}
export declare const EditableRoot: ForwardRefExoticComponent<EditableRootProps & RefAttributes<HTMLDivElement>>;
