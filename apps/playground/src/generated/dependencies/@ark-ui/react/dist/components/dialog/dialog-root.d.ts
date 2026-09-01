// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseDialogProps } from './use-dialog.d.ts';
export interface DialogRootBaseProps extends UseDialogProps, UsePresenceProps {
}
export interface DialogRootProps extends DialogRootBaseProps {
    children?: ReactNode | undefined;
}
export declare const DialogRoot: (props: DialogRootProps) => import("react").JSX.Element;
