import { requireWorkspaceAccess } from "@/lib/workspace-session";
import CatalogClient from "./CatalogClient";

export default async function CatalogPage() {
  await requireWorkspaceAccess("/catalog");
  return <CatalogClient />;
}
