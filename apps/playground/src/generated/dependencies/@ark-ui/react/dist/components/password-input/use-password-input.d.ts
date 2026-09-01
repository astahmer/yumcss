// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as passwordInput from '@zag-js/password-input';
export interface UsePasswordInputProps extends Optional<Omit<passwordInput.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UsePasswordInputReturn extends passwordInput.Api<PropTypes> {
}
export declare const usePasswordInput: (props?: UsePasswordInputProps) => UsePasswordInputReturn;
