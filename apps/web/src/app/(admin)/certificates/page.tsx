import { requireWorkspaceAccess } from "@/lib/workspace-session";
import CertificatesClient from "./CertificatesClient";

export const dynamic = "force-dynamic";

export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { user } = await requireWorkspaceAccess("/certificates");
  const params = await searchParams;
  return (
    <CertificatesClient
      user={user}
      initialSearch={typeof params.search === "string" ? params.search : ""}
    />
  );
}
