// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { PolymorphicProps } from '../factory.d.ts';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseDialogReturn } from './use-dialog.d.ts';
interface RootProviderProps {
    value: UseDialogReturn;
}
export interface DialogRootProviderBaseProps extends RootProviderProps, UsePresenceProps, PolymorphicProps {
}
export interface DialogRootProviderProps extends DialogRootProviderBaseProps {
    children?: ReactNode | undefined;
}
export declare const DialogRootProvider: (props: DialogRootProviderProps) => import("react").JSX.Element;
export {};
