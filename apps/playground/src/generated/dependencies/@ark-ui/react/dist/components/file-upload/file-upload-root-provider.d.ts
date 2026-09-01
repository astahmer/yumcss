// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseFileUploadReturn } from './use-file-upload.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseFileUploadReturn;
}
export interface FileUploadRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface FileUploadRootProviderProps extends HTMLProps<'div'>, FileUploadRootProviderBaseProps {
}
export declare const FileUploadRootProvider: ForwardRefExoticComponent<FileUploadRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
