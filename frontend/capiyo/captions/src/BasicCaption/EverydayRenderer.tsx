import React from "react";
import {
  BasicCaptionRenderer,
  type BasicCaptionRendererProps,
} from "./BasicCaptionRenderer";
export type EverydayVariant =
  | "simple-text"
  | "one-word"
  | "plain-active-word"
  | "soft-fade"
  | "pop-in"
  | "bold-impact"
  | "highlight-chip"
  | "underline-focus"
  | "stacked-text";
const highlights = {
  enabled: true,
  color: "#ffe36b",
  backgroundColor: "#570df8",
  mode: "text" as const,
  scale: 1,
};

export const EverydayCaption: React.FC<
  BasicCaptionRendererProps & { variant?: EverydayVariant }
> = ({ variant = "simple-text", ...props }) => (
  <BasicCaptionRenderer
    {...props}
    presentationConfig={{
      highlights,
      ...props.presentationConfig,
      activeWord: ["plain-active-word", "highlight-chip", "underline-focus"].includes(variant),
      underlineActive: variant === "underline-focus",
      stacked: variant === "stacked-text",
    }}
  />
);

// Both browser templates share the original timing engine and all editor controls.
export const SimpleText: React.FC<BasicCaptionRendererProps> = (props) => (
  <EverydayCaption {...props} variant="simple-text" />
);
export const PlainActiveWord: React.FC<BasicCaptionRendererProps> = (props) => (
  <EverydayCaption {...props} variant="plain-active-word" />
);
