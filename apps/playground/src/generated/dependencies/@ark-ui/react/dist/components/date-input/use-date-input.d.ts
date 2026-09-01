// Generated from the workspace-linked pandwind package. Do not edit.
import { Optional } from '../../types.d.ts';
import * as dateInput from '@zag-js/date-input';
export interface UseDateInputProps extends Optional<dateInput.Props, 'id'> {
}
export type UseDateInputReturn = ReturnType<typeof useDateInput>;
export declare const useDateInput: (props?: UseDateInputProps) => dateInput.Api;
