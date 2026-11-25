import { CAPTION_FONT_ASSETS } from "../../../captions/src/Basic/catalog";

/**
 * A render on AWS has no website to ask, so every website link in the render props (`/api/caption-file/<path>` and
 * `/api/caption-assets/<id>`) is pointed at the copy uploaded with the render site, `publicBase` being the site's
 * public folder URL. A font link the website cannot serve either is dropped, so the render falls back the way
 * the editor does instead of failing.
 */
export function renderableProps<T>(props: T, publicBase: string): T {
  const base = publicBase.replace(/\/$/, "");
  const link = (value: string) => {
    const file = value.match(/^\/api\/caption-file\/(.+)$/)?.[1];
    if (file) return `${base}/${encodeURI(decodeURI(file))}`;
    const id = value.match(/^\/api\/caption-assets\/([\w-]+)$/)?.[1];
    if (!id) return value;
    const bundled = CAPTION_FONT_ASSETS[id];
    return bundled ? `${base}/${encodeURI(bundled)}` : "";
  };
  const walk = (value: unknown): unknown =>
    typeof value === "string" ? link(value)
      : Array.isArray(value) ? value.map(walk)
      : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item)]))
      : value;
  return walk(props) as T;
}
