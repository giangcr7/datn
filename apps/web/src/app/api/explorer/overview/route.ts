import { explorerProxy } from "@/lib/explorer-proxy";

export async function GET() {
  return explorerProxy("/overview");
}
