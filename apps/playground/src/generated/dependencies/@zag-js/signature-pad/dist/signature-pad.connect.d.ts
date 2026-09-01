// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { SignaturePadService, SignaturePadApi } from './signature-pad.types.d.ts';
import '@zag-js/core';
import 'perfect-freehand';

declare function connect<T extends PropTypes>(service: SignaturePadService, normalize: NormalizeProps<T>): SignaturePadApi<T>;

export { connect };
