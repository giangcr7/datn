"use client";

import PageTitle from "@/components/PageTitle";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import { workflowJson } from "@/lib/diploma-workflow";
import {
  correctionEventLabels,
  correctionParams,
} from "@/lib/diploma-corrections";
import {
  replacementComparisonFields,
  replacementPrintComparisonFields,
  replacementEventLabels,
  replacementStages,
  type ReplacementDiploma,
  type ReplacementStage,
} from "@/lib/diploma-replacements";
import { dashboardTime } from "@/lib/dashboard";
import CorrectionEditor from "./CorrectionEditor";

type Action = "submit" | "reopen" | "reject" | "approve";
const actionLabels: Record<Action, string> = {
  submit: "Trình duyệt thay thế",
  reopen: "Mở lại để sửa",
  reject: "Từ chối hồ sơ",
  approve: "Duyệt và phát hành thay thế",
};
type HistoryEvent = {
  id: string;
  eventType: string;
  createdAt: string;
  reason: string | null;
};

export default function ReplacementsClient({
  initialStage,
}: {
  initialStage: ReplacementStage;
}) {
  const [stage, setStage] = useState<ReplacementStage>(initialStage);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<ReplacementDiploma[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<ReplacementDiploma | null>(null);
  const [comparison, setComparison] = useState<ReplacementDiploma | null>(null);
  const [action, setAction] = useState<{
    record: ReplacementDiploma;
    kind: Action;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionForm] = Form.useForm<{ note: string }>();
  const [history, setHistory] = useState<{
    id: string;
    events: HistoryEvent[];
    loading: boolean;
    error: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    workflowJson<{
      data: ReplacementDiploma[];
      pagination: { total: number; totalPages: number };
    }>(
      "/api/cert/replacements?" + correctionParams(stage, search, page, limit),
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result.data);
        setTotal(result.pagination.total);
        if (page > Math.max(1, result.pagination.totalPages))
          setPage(Math.max(1, result.pagination.totalPages));
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setData([]);
          setTotal(0);
          setError(
            failure instanceof Error
              ? failure.message
              : "Không tải được hồ sơ thay thế",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [stage, search, page, limit, revision]);
  const refresh = () => setRevision((value) => value + 1);
  async function act() {
    if (!action) return;
    const values = await actionForm.validateFields().catch(() => null);
    if (!values) return;
    setBusy(true);
    try {
      await workflowJson(
        "/api/cert/replacements/" + action.record.uuid + "/" + action.kind,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note: values.note,
            expectedUpdatedAt: action.record.updatedAt,
          }),
        },
      );
      message.success(
        action.kind === "approve"
          ? "Đã duyệt. Văn bằng mới đang chờ đồng bộ sau khi thu hồi bản cũ trên blockchain."
          : "Đã xử lý hồ sơ thay thế.",
      );
      setStage(
        action.kind === "approve"
          ? "APPROVED"
          : action.kind === "submit"
            ? "REQUESTED"
            : action.kind === "reject"
              ? "REJECTED"
              : "DRAFT",
      );
      setPage(1);
      setAction(null);
      refresh();
    } catch (failure) {
      message.error(
        failure instanceof Error ? failure.message : "Không xử lý được hồ sơ",
      );
      refresh();
    } finally {
      setBusy(false);
    }
  }
  async function openHistory(record: ReplacementDiploma) {
    setHistory({ id: record.uuid, events: [], loading: true, error: "" });
    try {
      const result = await workflowJson<{ history: HistoryEvent[] }>(
        "/api/cert/" + record.uuid + "/history",
      );
      setHistory((current) =>
        current?.id === record.uuid
          ? { ...current, events: result.history, loading: false }
          : current,
      );
    } catch (failure) {
      setHistory((current) =>
        current?.id === record.uuid
          ? {
              ...current,
              error:
                failure instanceof Error
                  ? failure.message
                  : "Không tải được lịch sử",
              loading: false,
            }
          : current,
      );
    }
  }
  return (
    <div className="workspace-section">
      <PageTitle level={2}>Sửa sai và phát hành văn bằng thay thế</PageTitle>
      <Alert
        type="info"
        showIcon
        className="mb-4"
        title="Mỗi văn bằng có hồ sơ và bản PDF riêng"
        description="Lập hồ sơ từ Sổ văn bằng. Đối chiếu bản cũ với thông tin sửa sai trước khi trình và duyệt. Hệ thống giữ nguyên bản cũ, thu hồi trên blockchain rồi mới ghi nhận bản mới; không tạo hai văn bằng cùng còn hiệu lực."
      />
      <Space wrap className="mb-4">
        <Select
          aria-label="Trạng thái hồ sơ thay thế"
          value={stage}
          options={replacementStages}
          style={{ minWidth: 210 }}
          onChange={(value) => {
            setStage(value);
            setPage(1);
          }}
        />
        <Input.Search
          placeholder="Họ tên, MSSV, số hiệu, số vào sổ"
          allowClear
          enterButton="Tra cứu"
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          style={{ width: 350, maxWidth: "100%" }}
        />
        <Button onClick={refresh} loading={loading}>
          Làm mới
        </Button>
        <Link href="/certificates">Về Sổ văn bằng</Link>
      </Space>
      {error && <Alert className="mb-4" type="error" showIcon title={error} />}
      <Table<ReplacementDiploma>
        rowKey="uuid"
        dataSource={data}
        loading={loading}
        scroll={{ x: 1250 }}
        locale={{
          emptyText: error
            ? "Chưa tải được dữ liệu"
            : "Chưa có hồ sơ thay thế ở trạng thái này",
        }}
        pagination={{
          current: page,
          pageSize: limit,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          onChange: (current, size) => {
            setPage(size === limit ? current : 1);
            setLimit(size);
          },
        }}
        columns={[
          {
            title: "Hồ sơ thay thế",
            key: "student",
            width: 230,
            render: (_, record) => (
              <>
                <Typography.Text strong>{record.fullName}</Typography.Text>
                <br />
                MSSV: {record.mssv}
                <br />
                Mới: {record.soHieu} · {record.soVaoSo}
              </>
            ),
          },
          {
            title: "Văn bằng gốc",
            key: "source",
            width: 190,
            render: (_, record) => (
              <>
                <Link
                  href={
                    "/certificates?search=" +
                    encodeURIComponent(record.replaces?.certificateNo || "")
                  }
                >
                  {record.replaces?.certificateNo || "Chưa ghi nhận"}
                </Link>
                <br />
                Sổ: {record.replaces?.registryNo}
                <br />
                {record.previous?.fullName}
              </>
            ),
          },
          {
            title: "Lý do và căn cứ",
            key: "basis",
            width: 290,
            render: (_, record) => (
              <>
                <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
                  {record.replacementReference?.reason}
                </Typography.Paragraph>
                <Typography.Text type="secondary">
                  {record.replacementReference?.basis}
                </Typography.Text>
                {record.rejection?.reason && (
                  <Alert
                    type="warning"
                    title={"Từ chối: " + record.rejection.reason}
                  />
                )}
              </>
            ),
          },
          {
            title: "Tình trạng",
            key: "status",
            width: 230,
            render: (_, record) =>
              stage === "APPROVED" ? (
                <Tag color={record.status === "ON_CHAIN" ? "green" : "orange"}>
                  {record.status === "ON_CHAIN"
                    ? "Đã phát hành"
                    : record.status === "ANCHOR_PENDING"
                      ? "Chờ đồng bộ blockchain"
                      : record.status === "REPLACED"
                        ? "Đã được thay thế tiếp"
                        : "Đã thu hồi"}
                </Tag>
              ) : record.correctionErrors.length ? (
                <ul>
                  {record.correctionErrors.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <Tag color="green">Đủ thông tin để trình duyệt</Tag>
              ),
          },
          {
            title: "Thao tác",
            key: "actions",
            width: 300,
            render: (_, record) => (
              <Space wrap>
                <Button onClick={() => setComparison(record)}>
                  Đối chiếu trước / sau
                </Button>
                {stage === "DRAFT" && (
                  <Button onClick={() => setEditor(record)}>
                    Sửa thông tin
                  </Button>
                )}
                {(stage === "DRAFT" || stage === "REQUESTED") &&
                  !record.correctionErrors.length && (
                    <Button
                      onClick={() =>
                        window.open(
                          "/api/cert/" + record.uuid + "/preview",
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      Xem trước PDF
                    </Button>
                  )}
                {(stage === "DRAFT"
                  ? (["submit"] as const)
                  : stage === "REQUESTED"
                    ? (["approve", "reject"] as const)
                    : stage === "REJECTED"
                      ? (["reopen"] as const)
                      : []
                ).map((kind) => (
                  <Button
                    key={kind}
                    type={
                      kind === "submit" || kind === "approve"
                        ? "primary"
                        : "default"
                    }
                    danger={kind === "reject"}
                    disabled={
                      (kind === "submit" || kind === "approve") &&
                      !!record.correctionErrors.length
                    }
                    onClick={() => {
                      actionForm.resetFields();
                      setAction({ record, kind });
                    }}
                  >
                    {actionLabels[kind]}
                  </Button>
                ))}
                {stage === "APPROVED" && record.status === "ON_CHAIN" && (
                  <Button
                    onClick={() =>
                      window.open(
                        "/api/cert/" + record.uuid + "/pdf",
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    Tải PDF mới
                  </Button>
                )}
                <Button onClick={() => void openHistory(record)}>
                  Lịch sử
                </Button>
              </Space>
            ),
          },
        ]}
      />
      {editor && (
        <CorrectionEditor
          replacement
          record={{ ...editor, workflowStatus: "DRAFT", rejection: null }}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            refresh();
          }}
        />
      )}
      <Modal
        open={!!comparison}
        title="Đối chiếu văn bằng gốc và văn bằng thay thế"
        width={980}
        footer={null}
        onCancel={() => setComparison(null)}
      >
        <Table
          pagination={false}
          size="small"
          scroll={{ x: 600 }}
          rowKey="key"
          dataSource={[
            ...replacementComparisonFields.map(([key, label]) => ({
              key,
              label,
              before: comparison?.previous?.[key] ?? "—",
              after: comparison?.[key] ?? "—",
            })),
            ...replacementPrintComparisonFields.map(([key, label]) => ({
              key,
              label,
              before: comparison?.previous?.printedDiploma?.[key] ?? "—",
              after: comparison?.printedDiploma?.[key] ?? "—",
            })),
          ]}
          columns={[
            { title: "Thông tin", dataIndex: "label" },
            { title: "Văn bằng gốc", dataIndex: "before" },
            {
              title: "Văn bằng thay thế",
              key: "after",
              render: (_, row) => (
                <Typography.Text
                  strong={row.before !== row.after}
                  type={row.before !== row.after ? "warning" : undefined}
                >
                  {row.after}
                </Typography.Text>
              ),
            },
          ]}
        />
        <Descriptions
          className="mt-4"
          column={1}
          items={[
            {
              key: "reason",
              label: "Lý do",
              children: comparison?.replacementReference?.reason,
            },
            {
              key: "basis",
              label: "Căn cứ",
              children: comparison?.replacementReference?.basis,
            },
          ]}
        />
      </Modal>
      <Modal
        open={!!action}
        title={action ? actionLabels[action.kind] : ""}
        confirmLoading={busy}
        onOk={() => void act()}
        onCancel={() => {
          if (!busy) setAction(null);
        }}
        okText="Xác nhận"
        cancelText="Đóng"
        maskClosable={!busy}
        cancelButtonProps={{ disabled: busy }}
      >
        <Typography.Paragraph>
          {action?.record.fullName} · {action?.record.soHieu}
        </Typography.Paragraph>
        {action?.kind === "approve" && (
          <Alert
            className="mb-4"
            type="warning"
            showIcon
            title="Bản cũ sẽ ngừng hiệu lực sau khi duyệt"
            description="Việc ký phải thành công mới lưu phê duyệt. Giao dịch thu hồi bản cũ được xử lý trước giao dịch phát hành bản mới. Nếu blockchain chưa xác nhận, bản mới vẫn chưa sử dụng được."
          />
        )}
        <Form form={actionForm} disabled={busy} layout="vertical">
          <Form.Item
            name="note"
            label="Nội dung xử lý / căn cứ đối chiếu"
            rules={[
              {
                required: true,
                whitespace: true,
                message: "Vui lòng ghi nội dung xử lý",
              },
            ]}
          >
            <Input.TextArea maxLength={2000} rows={4} showCount />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!history}
        title="Lịch sử hồ sơ thay thế"
        footer={null}
        onCancel={() => setHistory(null)}
      >
        {history?.loading ? (
          "Đang tải lịch sử…"
        ) : history?.error ? (
          <Alert type="error" title={history.error} />
        ) : (
          <Timeline
            items={history?.events.map((event) => ({
              key: event.id,
              content: (
                <>
                  <strong>
                    {replacementEventLabels[event.eventType] ||
                      correctionEventLabels[event.eventType] ||
                      event.eventType}
                  </strong>
                  <br />
                  {dashboardTime(event.createdAt)}
                  <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
                    {event.reason}
                  </Typography.Paragraph>
                </>
              ),
            }))}
          />
        )}
      </Modal>
    </div>
  );
}
