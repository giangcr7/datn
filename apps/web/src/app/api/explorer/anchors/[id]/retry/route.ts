import { explorerProxy } from "@/lib/explorer-proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return explorerProxy(
    "/anchors/" + encodeURIComponent(id) + "/retry",
    "POST",
    false,
    request,
  );
}
