// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseImageCropperReturn } from './use-image-cropper.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseImageCropperReturn;
}
export interface ImageCropperRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface ImageCropperRootProviderProps extends HTMLProps<'div'>, ImageCropperRootProviderBaseProps {
}
export declare const ImageCropperRootProvider: ForwardRefExoticComponent<ImageCropperRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
