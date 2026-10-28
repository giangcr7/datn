import { explorerProxy } from "@/lib/explorer-proxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ txId: string }> },
) {
  const { txId } = await params;
  return explorerProxy("/tx/" + encodeURIComponent(txId));
}
