// Generated from the workspace-linked pandwind package. Do not edit.
import { borderResolver } from './border-resolver/border-resolver.d.ts';
import { colorResolver, textColorResolver } from './color-resolver/color-resolver.d.ts';
import { fontFamilyResolver } from './font-family-resolver/font-family-resolver.d.ts';
import { fontSizeResolver } from './font-size-resolver/font-size-resolver.d.ts';
import { identityResolver } from './identity-resolver/identity-resolver.d.ts';
import { lineHeightResolver } from './line-height-resolver/line-height-resolver.d.ts';
import { radiusResolver } from './radius-resolver/radius-resolver.d.ts';
import { sizeResolver } from './size-resolver/size-resolver.d.ts';
import { spacingResolver } from './spacing-resolver/spacing-resolver.d.ts';
export declare const resolvers: {
    color: typeof colorResolver;
    textColor: typeof textColorResolver;
    fontSize: typeof fontSizeResolver;
    spacing: typeof spacingResolver;
    radius: typeof radiusResolver;
    identity: typeof identityResolver;
    size: typeof sizeResolver;
    lineHeight: typeof lineHeightResolver;
    fontFamily: typeof fontFamilyResolver;
    border: typeof borderResolver;
};
export type StylePropType = keyof typeof resolvers;
