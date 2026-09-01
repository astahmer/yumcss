// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as pinInput from '@zag-js/pin-input';
export interface UsePinInputProps extends Optional<Omit<pinInput.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UsePinInputReturn extends pinInput.Api<PropTypes> {
}
export declare const usePinInput: (props?: UsePinInputProps) => UsePinInputReturn;
