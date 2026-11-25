import React from "react";
import { Luxe, resolveLuxeMetadata, type LuxeProps } from "../Luxe";

export type BlendCursorProps = LuxeProps;

/** Luxe motion with neutral Caption 3 corner depth and Caption 6's raw white difference ink. */
export const BlendCursor: React.FC<BlendCursorProps> = ({ styleConfig, ...props }) =>
  <Luxe {...props} styleConfig={{ ...styleConfig, heroTreatment: "caption-six" }} />;

export const resolveBlendCursorMetadata = resolveLuxeMetadata;
