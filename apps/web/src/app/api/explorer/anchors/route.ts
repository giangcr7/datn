import { explorerProxy } from "@/lib/explorer-proxy";

export async function GET(req: Request) {
  return explorerProxy("/anchors" + new URL(req.url).search, "GET", true);
}
