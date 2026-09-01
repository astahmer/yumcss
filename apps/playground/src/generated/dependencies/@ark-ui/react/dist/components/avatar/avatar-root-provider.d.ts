// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseAvatarReturn } from './use-avatar.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseAvatarReturn;
}
export interface AvatarRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface AvatarRootProviderProps extends HTMLProps<'div'>, AvatarRootProviderBaseProps {
}
export declare const AvatarRootProvider: ForwardRefExoticComponent<AvatarRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
