// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as signaturePad from '@zag-js/signature-pad';
export interface UseSignaturePadProps extends Optional<Omit<signaturePad.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseSignaturePadReturn extends signaturePad.Api<PropTypes> {
}
export declare const useSignaturePad: (props?: UseSignaturePadProps) => UseSignaturePadReturn;
