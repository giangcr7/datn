import { isIP } from "node:net";
import { headers } from "next/headers";

type IncomingHeaders = Headers | Record<string, string | string[] | undefined>;

export function forwardedClientHeaders(
  incoming: IncomingHeaders,
  enabled = process.env.FORWARD_CLIENT_IP === "true",
): Record<string, string> {
  if (!enabled) return {};
  const value =
    incoming instanceof Headers
      ? incoming.get("x-forwarded-for")
      : incoming["x-forwarded-for"];
  if (typeof value !== "string" || value.length > 512) return {};
  const addresses = value.split(",").map((address) => address.trim());
  if (
    !addresses.length ||
    addresses.length > 8 ||
    addresses.some((address) => !isIP(address))
  )
    return {};
  return { "X-Forwarded-For": addresses.join(", ") };
}

export async function requestClientHeaders(): Promise<Record<string, string>> {
  if (process.env.FORWARD_CLIENT_IP !== "true") return {};
  return forwardedClientHeaders(await headers());
}
