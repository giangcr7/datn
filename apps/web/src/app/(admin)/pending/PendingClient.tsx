"use client";

import PageTitle from "@/components/PageTitle";
import DiplomaWorkflowWorkspace from "@/components/DiplomaWorkflowWorkspace";
import type { WorkspaceUser } from "@/lib/workspace-access";
import { Tabs } from "antd";
import { useRouter } from "next/navigation";
import CorrectionsClient from "./CorrectionsClient";
import ReplacementsClient from "./ReplacementsClient";

export default function PendingClient({
  user,
  view,
  stage,
  replacementStage,
}: {
  user: WorkspaceUser;
  view: "pending" | "rejected" | "replacements";
  stage: "DRAFT" | "REJECTED";
  replacementStage: "DRAFT" | "REQUESTED" | "REJECTED" | "APPROVED";
}) {
  const router = useRouter();
  return (
    <div className="workspace-page">
      <PageTitle>Duyệt và xử lý hồ sơ</PageTitle>
      <Tabs
        activeKey={view}
        onChange={(value) => router.replace("/pending?view=" + value)}
        items={[
          {
            key: "pending",
            label: "Chờ duyệt",
            children: <DiplomaWorkflowWorkspace mode="pending" user={user} />,
          },
          {
            key: "rejected",
            label: "Bị từ chối / Đang bổ sung",
            children: <CorrectionsClient key={stage} initialStage={stage} />,
          },
          {
            key: "replacements",
            label: "Sửa sai và thay thế",
            children: (
              <ReplacementsClient
                key={replacementStage}
                initialStage={replacementStage}
              />
            ),
          },
        ]}
        destroyOnHidden
      />
    </div>
  );
}
