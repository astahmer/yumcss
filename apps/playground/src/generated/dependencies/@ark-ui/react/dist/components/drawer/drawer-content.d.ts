// Generated from the workspace-linked pandwind package. Do not edit.
import { ContentProps } from '@zag-js/drawer';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface DrawerContentBaseProps extends PolymorphicProps, ContentProps {
}
export interface DrawerContentProps extends Omit<HTMLProps<'div'>, 'draggable'>, DrawerContentBaseProps {
}
export declare const DrawerContent: ForwardRefExoticComponent<DrawerContentProps & RefAttributes<HTMLDivElement>>;
