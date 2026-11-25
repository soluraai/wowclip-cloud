import React from "react";
import { BasicStyle } from "./Basic/BasicStyle";
import { resolveBasicStyleId } from "./Basic/catalog";
import { StandardStyle } from "./Standard/StandardStyle";
import { isStandardStyleId } from "./Standard/catalog";
import { PremiumStyle } from "./Premium/PremiumStyle";
import { isPremiumStyleId } from "./Premium/catalog";
import type { BasicCaptionRendererProps } from "./BasicCaption/BasicCaptionRenderer";
import { useCaptionLanguage } from "./Script/useCaptionLanguage";

export type CaptionStyleRendererProps = Omit<BasicCaptionRendererProps, "sourceConfig"> & {
  sourceConfig?: unknown;
  styleId?: string;
};

export const CaptionStyleRenderer: React.FC<CaptionStyleRendererProps> = ({ styleId, ...input }) => {
  const { props, fontsKey } = useCaptionLanguage(input, styleId);
  // Keyed on the script fonts, so a template measures its words again once Hindi or Tamil faces are in.
  return isPremiumStyleId(styleId) ? <PremiumStyle key={fontsKey} {...(props as any)} styleId={styleId} /> :
    isStandardStyleId(styleId) ? <StandardStyle key={fontsKey} {...(props as any)} styleId={styleId} />
      : <BasicStyle key={fontsKey} {...(props as any)} styleId={resolveBasicStyleId(styleId)} />;
};
