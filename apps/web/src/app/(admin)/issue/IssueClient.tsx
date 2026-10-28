"use client";
import DiplomaWorkflowWorkspace from "@/components/DiplomaWorkflowWorkspace";
import type { WorkspaceUser } from "@/lib/workspace-access";

export default function IssueClient({
  initialBatchId = "",
  user,
}: {
  initialBatchId?: string;
  user: WorkspaceUser;
}) {
  return (
    <DiplomaWorkflowWorkspace
      mode="prepare"
      user={user}
      initialBatchId={initialBatchId}
    />
  );
}
