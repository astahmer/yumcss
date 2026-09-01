// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseTagsInputReturn } from './use-tags-input.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseTagsInputReturn;
}
export interface TagsInputRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface TagsInputRootProviderProps extends HTMLProps<'div'>, TagsInputRootProviderBaseProps {
}
export declare const TagsInputRootProvider: ForwardRefExoticComponent<TagsInputRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
