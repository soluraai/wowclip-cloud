import { CAPTION_FONT_ASSETS as ASSETS } from "@caption-basic-catalog";

/**
 * A caption font by its id (saved drafts store these links). The files themselves are static
 * (public/, copied from ../captions/public), so this only points the browser at the right one.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  const file = ASSETS[asset];
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(null, {
    status: 308,
    headers: { Location: `/${file.split("/").map(encodeURIComponent).join("/")}`, "Cache-Control": "public, max-age=604800" },
  });
}
