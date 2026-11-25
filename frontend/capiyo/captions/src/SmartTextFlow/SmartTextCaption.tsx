import React, { useMemo } from "react";
import { SmartTextFlow, resolveSmartTextFlowMetadata, type SmartTextFlowProps } from "./SmartTextFlow";
import config from "./smart-text-caption.config.json";
import type { FlowStyle } from "./types";

const DEFAULTS: FlowStyle = { ...config, colorMode: "palette", numberLayout: "inline" };

/** Speech-timed SmartTextView typography, with restrained automatic color variation. */
export const SmartTextCaption: React.FC<SmartTextFlowProps> = ({ styleConfig, ...props }) => {
  const style = useMemo(() => ({ ...DEFAULTS, ...styleConfig }), [styleConfig]);
  return <SmartTextFlow {...props} styleConfig={style} />;
};
export const resolveSmartTextCaptionMetadata = ({ props }: { props: SmartTextFlowProps }) =>
  resolveSmartTextFlowMetadata({ props: { ...props, styleConfig: { ...DEFAULTS, ...props.styleConfig } } });
