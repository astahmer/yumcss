// Generated from the workspace-linked pandwind package. Do not edit.
import { HiddenInputProps } from '@zag-js/signature-pad';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface SignaturePadHiddenInputBaseProps extends HiddenInputProps, PolymorphicProps {
}
export interface SignaturePadHiddenInputProps extends Assign<HTMLProps<'input'>, SignaturePadHiddenInputBaseProps> {
}
export declare const SignaturePadHiddenInput: ForwardRefExoticComponent<SignaturePadHiddenInputProps & RefAttributes<HTMLInputElement>>;
