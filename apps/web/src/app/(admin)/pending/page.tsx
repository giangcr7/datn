import { requireWorkspaceAccess } from "@/lib/workspace-session";
import PendingClient from "./PendingClient";

export default async function PendingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; stage?: string }>;
}) {
  const { user } = await requireWorkspaceAccess("/pending");
  const params = await searchParams;
  return (
    <PendingClient
      user={user}
      view={
        params.view === "replacements"
          ? "replacements"
          : params.view === "rejected"
            ? "rejected"
            : "pending"
      }
      stage={params.stage === "DRAFT" ? "DRAFT" : "REJECTED"}
      replacementStage={
        params.stage === "REQUESTED" ||
        params.stage === "REJECTED" ||
        params.stage === "APPROVED"
          ? params.stage
          : "DRAFT"
      }
    />
  );
}
