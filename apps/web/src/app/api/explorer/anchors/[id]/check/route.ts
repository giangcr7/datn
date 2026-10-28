import { explorerProxy } from "@/lib/explorer-proxy";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return explorerProxy("/anchors/" + encodeURIComponent(id) + "/check", "POST");
}
