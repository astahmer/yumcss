// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { Service } from '@zag-js/core';
import { AccordionSchema, AccordionApi } from './accordion.types.d.ts';

declare function connect<T extends PropTypes>(service: Service<AccordionSchema>, normalize: NormalizeProps<T>): AccordionApi<T>;

export { connect };
