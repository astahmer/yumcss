// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseQrCodeReturn } from './use-qr-code.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseQrCodeReturn;
}
export interface QrCodeRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface QrCodeRootProviderProps extends HTMLProps<'div'>, QrCodeRootProviderBaseProps {
}
export declare const QrCodeRootProvider: ForwardRefExoticComponent<QrCodeRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
