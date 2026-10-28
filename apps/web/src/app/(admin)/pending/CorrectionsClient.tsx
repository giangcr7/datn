"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Segmented,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { workflowJson } from "@/lib/diploma-workflow";
import {
  correctionEventLabels,
  correctionParams,
  type CorrectionDiploma,
} from "@/lib/diploma-corrections";
import { dashboardTime } from "@/lib/dashboard";
import CorrectionEditor from "./CorrectionEditor";

interface Page {
  data: CorrectionDiploma[];
  pagination: { total: number; totalPages: number };
}
interface HistoryEvent {
  id: string;
  eventType: string;
  reason: string | null;
  createdAt: string;
  metadata?: { changes?: string[] } | null;
}

export default function CorrectionsClient({
  initialStage,
}: {
  initialStage: "DRAFT" | "REJECTED";
}) {
  const [stage, setStage] = useState<string>(initialStage);
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [rows, setRows] = useState<CorrectionDiploma[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<CorrectionDiploma | null>(null);
  const [action, setAction] = useState<{
    record: CorrectionDiploma;
    kind: "reopen" | "resubmit";
  } | null>(null);
  const [actionForm] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{
    record: CorrectionDiploma;
    events: HistoryEvent[];
    error: string;
    loading: boolean;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    workflowJson<Page>(
      "/api/cert/corrections?" + correctionParams(stage, search, page, limit),
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setRows(result.data);
        setTotal(result.pagination.total);
        if (page > Math.max(1, result.pagination.totalPages))
          setPage(Math.max(1, result.pagination.totalPages));
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setRows([]);
          setTotal(0);
          setError(
            failure instanceof Error ? failure.message : "Không tải được hồ sơ",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [stage, search, page, limit, revision]);

  function openAction(record: CorrectionDiploma, kind: "reopen" | "resubmit") {
    actionForm.resetFields();
    setAction({ record, kind });
  }
  async function act() {
    if (!action) return;
    const values = await actionForm.validateFields().catch(() => null);
    if (!values) return;
    setBusy(true);
    try {
      await workflowJson(
        "/api/cert/corrections/" + action.record.uuid + "/" + action.kind,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note: values.note,
            expectedUpdatedAt: action.record.updatedAt,
          }),
        },
      );
      if (action.kind === "reopen") {
        message.success("Đã mở lại. Hồ sơ nằm trong nhóm Đang bổ sung.");
        setStage("DRAFT");
        setPage(1);
      } else
        message.success(
          "Đã trình duyệt lại. Hồ sơ chuyển về nhóm Chờ duyệt; chưa ký hoặc phát hành.",
        );
      setAction(null);
      setRevision((value) => value + 1);
    } catch (failure) {
      message.error(
        failure instanceof Error ? failure.message : "Không xử lý được hồ sơ",
      );
      setRevision((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  async function openHistory(record: CorrectionDiploma) {
    setHistory({ record, events: [], error: "", loading: true });
    try {
      const result = await workflowJson<{ history: HistoryEvent[] }>(
        "/api/cert/" + record.uuid + "/history",
      );
      setHistory((current) =>
        current?.record.uuid === record.uuid
          ? { ...current, events: result.history, loading: false }
          : current,
      );
    } catch (failure) {
      setHistory((current) =>
        current?.record.uuid === record.uuid
          ? {
              ...current,
              loading: false,
              error:
                failure instanceof Error
                  ? failure.message
                  : "Không tải được lịch sử",
            }
          : current,
      );
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <Typography.Title level={3}>Hồ sơ bị từ chối và bổ sung</Typography.Title>
      <Alert
        showIcon
        type="info"
        title="Bị từ chối → Mở lại → Bổ sung → Trình duyệt lại"
        description="Giữ nguyên mã hồ sơ, lý do từ chối và lịch sử các lần xử lý. Trình duyệt lại không đồng nghĩa đã ký hay phát hành."
      />
      <Space wrap>
        <Segmented
          value={stage}
          onChange={(value) => {
            setStage(String(value));
            setPage(1);
          }}
          options={[
            { label: "Bị từ chối", value: "REJECTED" },
            { label: "Đang bổ sung", value: "DRAFT" },
          ]}
        />
        <Input.Search
          allowClear
          placeholder="Họ tên, MSSV, số hiệu, số vào sổ"
          value={draftSearch}
          maxLength={255}
          onChange={(event) => setDraftSearch(event.target.value)}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          enterButton="Tra cứu"
          style={{ maxWidth: "100%", width: 380 }}
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => setRevision((value) => value + 1)}
          loading={loading}
        >
          Tải lại
        </Button>
      </Space>
      {error && <Alert type="error" showIcon title={error} />}
      <Table<CorrectionDiploma>
        rowKey="uuid"
        dataSource={rows}
        loading={loading}
        scroll={{ x: 1150 }}
        locale={{
          emptyText: error
            ? "Chưa tải được hồ sơ"
            : stage === "REJECTED"
              ? "Không có hồ sơ bị từ chối"
              : "Không có hồ sơ đang bổ sung",
        }}
        pagination={{
          current: page,
          pageSize: limit,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          onChange: (nextPage, nextLimit) => {
            setPage(nextPage);
            setLimit(nextLimit);
          },
        }}
        columns={[
          {
            title: "Sinh viên",
            key: "student",
            width: 200,
            render: (_, record) => (
              <>
                <Typography.Text strong>{record.fullName}</Typography.Text>
                <br />
                {record.mssv}
              </>
            ),
          },
          {
            title: "Văn bằng",
            key: "diploma",
            width: 180,
            render: (_, record) => (
              <>
                {record.soHieu}
                <br />
                <Typography.Text type="secondary">
                  Sổ: {record.soVaoSo}
                </Typography.Text>
              </>
            ),
          },
          {
            title: "Lý do từ chối gần nhất",
            key: "reason",
            width: 280,
            render: (_, record) => (
              <>
                <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
                  {record.rejection?.reason ||
                    "Chưa ghi nhận lý do trong dữ liệu cũ"}
                </Typography.Paragraph>
                <Typography.Text type="secondary">
                  {record.rejection?.rejectedBy || "Chưa ghi nhận người xử lý"}
                  <br />
                  {dashboardTime(record.rejection?.rejectedAt)}
                </Typography.Text>
              </>
            ),
          },
          {
            title: "Kiểm tra",
            key: "checks",
            width: 240,
            render: (_, record) =>
              record.blockedReason ? (
                <Typography.Text type="danger">
                  {record.blockedReason}
                </Typography.Text>
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
            width: 240,
            render: (_, record) => (
              <Space wrap>
                {stage === "REJECTED" ? (
                  <Button
                    disabled={!!record.blockedReason}
                    onClick={() => openAction(record, "reopen")}
                  >
                    Mở lại để bổ sung
                  </Button>
                ) : (
                  <>
                    <Button
                      disabled={!!record.blockedReason}
                      onClick={() => setEditor(record)}
                    >
                      Bổ sung thông tin
                    </Button>
                    <Button
                      type="primary"
                      disabled={
                        !!record.blockedReason ||
                        !!record.correctionErrors.length
                      }
                      onClick={() => openAction(record, "resubmit")}
                    >
                      Trình duyệt lại
                    </Button>
                    <Button
                      disabled={
                        !!record.blockedReason ||
                        !!record.correctionErrors.length
                      }
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
                  </>
                )}
                <Button onClick={() => void openHistory(record)}>
                  Lịch sử
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Link href="/pending?view=pending">Về danh sách chờ duyệt</Link>
      {editor && (
        <CorrectionEditor
          record={editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setRevision((value) => value + 1);
          }}
        />
      )}
      <Modal
        open={!!action}
        title={
          action?.kind === "reopen"
            ? "Mở lại hồ sơ bị từ chối"
            : "Trình duyệt lại hồ sơ"
        }
        onCancel={() => {
          if (!busy) setAction(null);
        }}
        onOk={() => void act()}
        confirmLoading={busy}
        okText={action?.kind === "reopen" ? "Mở lại" : "Trình duyệt lại"}
        cancelText="Hủy"
        cancelButtonProps={{ disabled: busy }}
        maskClosable={!busy}
      >
        <Typography.Paragraph>
          {action?.record.fullName} · {action?.record.mssv}
        </Typography.Paragraph>
        <Typography.Paragraph>
          Lý do từ chối: {action?.record.rejection?.reason || "Chưa ghi nhận"}
        </Typography.Paragraph>
        <Form form={actionForm} layout="vertical" disabled={busy}>
          <Form.Item
            name="note"
            label="Nội dung xử lý / căn cứ đối chiếu"
            rules={[
              {
                required: true,
                whitespace: true,
                message: "Vui lòng ghi căn cứ xử lý",
              },
            ]}
          >
            <Input.TextArea rows={4} maxLength={2000} showCount />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!history}
        title="Lịch sử xử lý hồ sơ"
        footer={null}
        onCancel={() => setHistory(null)}
        width={760}
      >
        {history?.error && (
          <Alert showIcon type="error" title={history.error} />
        )}
        {history?.loading ? (
          <Typography.Paragraph>Đang tải lịch sử…</Typography.Paragraph>
        ) : (
          <Timeline
            items={history?.events.map((event) => ({
              key: event.id,
              color: event.eventType === "REJECTED" ? "red" : "blue",
              content: (
                <>
                  <Typography.Text strong>
                    {correctionEventLabels[event.eventType] || event.eventType}
                  </Typography.Text>
                  <br />
                  <Typography.Text type="secondary">
                    {dashboardTime(event.createdAt)}
                  </Typography.Text>
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
