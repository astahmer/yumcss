// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface FileUploadItemPreviewBaseProps extends PolymorphicProps {
    /**
     * The file type to match against. Matches all file types by default.
     * @default '.*'
     */
    type?: string | undefined;
}
export interface FileUploadItemPreviewProps extends HTMLProps<'div'>, FileUploadItemPreviewBaseProps {
}
export declare const FileUploadItemPreview: ForwardRefExoticComponent<FileUploadItemPreviewProps & RefAttributes<HTMLImageElement>>;
