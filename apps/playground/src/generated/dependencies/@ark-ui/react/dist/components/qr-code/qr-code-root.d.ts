// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseQrCodeProps } from './use-qr-code.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface QrCodeRootBaseProps extends UseQrCodeProps, PolymorphicProps {
}
export interface QrCodeRootProps extends Assign<HTMLProps<'div'>, QrCodeRootBaseProps> {
}
export declare const QrCodeRoot: ForwardRefExoticComponent<QrCodeRootProps & RefAttributes<HTMLDivElement>>;
