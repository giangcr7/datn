"use client";

import PageTitle from "@/components/PageTitle";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  ReloadOutlined,
  SearchOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { workflowJson } from "@/lib/diploma-workflow";
import {
  activityLabels,
  activitySearchParams,
  type ActivityEntry,
  type ActivityFilters,
  type SecurityAlert,
  type SecurityAlertStatus,
  type SecuritySummary,
  type SessionDevice,
} from "@/lib/activity";

const emptyFilters: ActivityFilters = {
  search: "",
  action: "",
  result: "",
  from: "",
  to: "",
};

const targetKindLabels: Record<string, string> = {
  diploma: "Văn bằng",
  student: "Sinh viên",
  program: "Ngành đào tạo",
  "issuance-batch": "Đợt cấp",
  "import-batch": "Lô import",
  "import-row": "Dòng import",
  "change-request": "Yêu cầu chỉnh sửa",
};

const referenceKindLabels: Record<string, string> = {
  target: "Đối tượng",
  request: "Yêu cầu",
  blockchain: "Blockchain",
  source: "Nguồn dữ liệu",
  record: "Bản ghi liên quan",
};

const metadataLabels: Record<string, string> = {
  actorId: "Mã tài khoản",
  after: "Thông tin sau thay đổi",
  anchorId: "Mã neo blockchain",
  basis: "Căn cứ xử lý",
  before: "Thông tin trước thay đổi",
  batchId: "Mã đợt",
  blockNumber: "Số block",
  changeRequestId: "Mã yêu cầu chỉnh sửa",
  code: "Mã nghiệp vụ",
  corrections: "Nội dung điều chỉnh",
  count: "Số lượng",
  diplomaId: "Mã văn bằng",
  diplomaIds: "Danh sách mã văn bằng",
  emailSent: "Đã gửi email",
  eventType: "Loại sự kiện",
  expiresAt: "Thời hạn liên kết",
  note: "Ghi chú xử lý",
  outboxId: "Mã hàng đợi blockchain",
  previousAttempts: "Số lần thử trước",
  previousError: "Lỗi lần thử trước",
  previousIssuedOn: "Ngày cấp trước đó",
  programId: "Mã ngành đào tạo",
  reason: "Lý do",
  recipientEmail: "Email người nhận",
  recheckedRowIds: "Các dòng đã kiểm tra lại",
  replacementId: "Mã hồ sơ thay thế",
  requestId: "Mã yêu cầu",
  sourceHash: "Mã băm nguồn",
  sourceId: "Mã nguồn",
  sourceRowId: "Mã dòng dữ liệu nguồn",
  status: "Trạng thái",
  transactionId: "Mã giao dịch blockchain",
  txId: "Mã giao dịch blockchain",
  version: "Phiên bản dữ liệu",
};

const timeLabel = (value: string) =>
  new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

const sessionAgentLabel = (value: string | null) =>
  value?.trim() || "Không xác định thiết bị / trình duyệt";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const metadataLabel = (key: string) =>
  metadataLabels[key] ||
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());

function metadataText(key: string, value: unknown) {
  if (value === null || value === undefined) return "Không có dữ liệu";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "number") return value.toLocaleString("vi-VN");
  if (typeof value !== "string") return String(value);

  if (/At$|Date$|On$/.test(key) && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00+07:00`).toLocaleDateString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
  }
  if (
    /At$|Date$|On$/.test(key) &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    !Number.isNaN(new Date(value).getTime())
  ) {
    return timeLabel(value);
  }
  return value;
}

function MetadataValue({
  fieldKey,
  value,
}: {
  fieldKey: string;
  value: unknown;
}): ReactNode {
  if (Array.isArray(value)) {
    if (value.length === 0)
      return (
        <Typography.Text type="secondary">Không có dữ liệu</Typography.Text>
      );
    return (
      <Space direction="vertical" size={8} className="w-full">
        {value.map((item, index) => (
          <div
            key={`${fieldKey}-${index}`}
            className="rounded border border-solid border-gray-200 bg-gray-50 px-3 py-2"
          >
            <Typography.Text type="secondary" className="text-xs">
              Mục {index + 1}
            </Typography.Text>
            <div className="mt-1">
              <MetadataValue fieldKey={`${fieldKey}-${index}`} value={item} />
            </div>
          </div>
        ))}
      </Space>
    );
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0)
      return (
        <Typography.Text type="secondary">Không có dữ liệu</Typography.Text>
      );
    return (
      <Descriptions
        bordered
        size="small"
        column={1}
        className="w-full"
        items={entries.map(([key, child]) => ({
          key,
          label: metadataLabel(key),
          children: <MetadataValue fieldKey={key} value={child} />,
        }))}
      />
    );
  }

  const text = metadataText(fieldKey, value);
  const copyText =
    typeof value === "string" && value.length >= 36 ? value : undefined;
  return (
    <Typography.Text
      className="block break-all"
      copyable={copyText ? { text: copyText } : undefined}
    >
      {text}
    </Typography.Text>
  );
}

type DiffRow = {
  key: string;
  field: string;
  before: unknown;
  after: unknown;
};

function flattenValue(
  value: unknown,
  prefix: string,
  result: Record<string, unknown>,
) {
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, child]) =>
      flattenValue(child, prefix ? `${prefix}.${key}` : key, result),
    );
    return;
  }
  result[prefix || "Giá trị"] = value;
}

function changed(before: unknown, after: unknown) {
  try {
    return JSON.stringify(before) !== JSON.stringify(after);
  } catch {
    return String(before) !== String(after);
  }
}

function buildDiffRows(before: unknown, after: unknown): DiffRow[] {
  const beforeFlat: Record<string, unknown> = {};
  const afterFlat: Record<string, unknown> = {};
  flattenValue(before, "", beforeFlat);
  flattenValue(after, "", afterFlat);
  return Array.from(
    new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)]),
  )
    .filter((key) => changed(beforeFlat[key], afterFlat[key]))
    .map((key) => ({
      key,
      field: key.split(".").map(metadataLabel).join(" / "),
      before: beforeFlat[key],
      after: afterFlat[key],
    }));
}

function buildChangeListRows(value: unknown): DiffRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!isRecord(item) || !("before" in item) || !("after" in item)) return [];
    const field =
      typeof item.field === "string" ? item.field : `Trường ${index + 1}`;
    return changed(item.before, item.after)
      ? [
          {
            key: `change-${index}`,
            field: metadataLabel(field),
            before: item.before,
            after: item.after,
          },
        ]
      : [];
  });
}

function CodeValue({ value }: { value: string | null | undefined }) {
  if (!value)
    return <Typography.Text type="secondary">Không có dữ liệu</Typography.Text>;
  return (
    <Typography.Text copyable={{ text: value }} className="break-all">
      {value}
    </Typography.Text>
  );
}

function SecurityAlertItem({
  alert,
  onStatusChange,
  statusLoading,
}: {
  alert: SecurityAlert;
  onStatusChange: (id: string, status: SecurityAlertStatus) => void;
  statusLoading: boolean;
}) {
  const isIp = alert.kind === "IP_FAILURE_BURST";
  const isRateLimit = alert.kind === "RATE_LIMIT_BURST";
  const status = alert.status || "OPEN";
  const statusLabels: Record<SecurityAlertStatus, string> = {
    OPEN: "Mới",
    ACKNOWLEDGED: "Đã xem",
    RESOLVED: "Đã xử lý",
    DISMISSED: "Đã bỏ qua",
  };
  const statusColors: Record<SecurityAlertStatus, string> = {
    OPEN: "red",
    ACKNOWLEDGED: "blue",
    RESOLVED: "green",
    DISMISSED: "default",
  };
  return (
    <List.Item
      actions={[
        ...(status === "OPEN"
          ? [
              <Button
                key="acknowledge"
                size="small"
                loading={statusLoading}
                onClick={() => onStatusChange(alert.id, "ACKNOWLEDGED")}
              >
                Đã xem
              </Button>,
            ]
          : []),
        ...(status === "OPEN" || status === "ACKNOWLEDGED"
          ? [
              <Button
                key="resolve"
                size="small"
                type="primary"
                loading={statusLoading}
                onClick={() => onStatusChange(alert.id, "RESOLVED")}
              >
                Đã xử lý
              </Button>,
            ]
          : [
              <Button
                key="reopen"
                size="small"
                loading={statusLoading}
                onClick={() => onStatusChange(alert.id, "OPEN")}
              >
                Mở lại
              </Button>,
            ]),
      ]}
    >
      <List.Item.Meta
        title={
          <Space wrap>
            <Tag color={alert.severity === "HIGH" ? "red" : "orange"}>
              {alert.severity === "HIGH" ? "Mức cao" : "Cần chú ý"}
            </Tag>
            <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
            <Typography.Text strong>
              {isRateLimit
                ? "Request bị chặn do vượt giới hạn tần suất"
                : isIp
                  ? "Một IP thử đăng nhập dồn dập"
                  : "Một tài khoản bị thử mật khẩu nhiều lần"}
            </Typography.Text>
          </Space>
        }
        description={
          <Space direction="vertical" size={2}>
            <Typography.Text>
              {alert.subjectType}:{" "}
              <Typography.Text code>{alert.subject}</Typography.Text> ·{" "}
              <Typography.Text strong>
                {alert.count} {isRateLimit ? "request bị chặn" : "lần thất bại"}
              </Typography.Text>{" "}
              trong {alert.windowMinutes} phút.
            </Typography.Text>
            <Typography.Text type="secondary">
              Từ {timeLabel(alert.firstAt)} đến {timeLabel(alert.lastAt)} ·{" "}
              {alert.auditIds.length} nhật ký liên quan
            </Typography.Text>
            <Space wrap size={[4, 4]}>
              {alert.auditIds.slice(0, 4).map((id) => (
                <Typography.Text key={id} code copyable={{ text: id }}>
                  {id}
                </Typography.Text>
              ))}
              {alert.auditIds.length > 4 && (
                <Typography.Text type="secondary">
                  +{alert.auditIds.length - 4} mã khác
                </Typography.Text>
              )}
            </Space>
            {alert.statusNote && (
              <Typography.Text type="secondary">
                Ghi chú xử lý: {alert.statusNote} · {alert.statusChangedBy}
              </Typography.Text>
            )}
          </Space>
        }
      />
    </List.Item>
  );
}

interface ActivityPage {
  data: ActivityEntry[];
  total: number;
}

export default function ActivityClient() {
  const [form] = Form.useForm<ActivityFilters>();
  const [filters, setFilters] = useState(emptyFilters);
  const [pagination, setPagination] = useState({ page: 1, limit: 20 });
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ActivityEntry | null>(null);
  const [related, setRelated] = useState<ActivityEntry[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState("");
  const [security, setSecurity] = useState<SecuritySummary | null>(null);
  const [securityLoading, setSecurityLoading] = useState(true);
  const [securityError, setSecurityError] = useState("");
  const [securityActionId, setSecurityActionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionDevice[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
  const [sessionActionId, setSessionActionId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = activitySearchParams(
      filters,
      pagination.page,
      pagination.limit,
    );
    workflowJson<ActivityPage>(`/api/activity?${params}`, {
      signal: controller.signal,
    })
      .then((result) => {
        setData(result.data);
        setTotal(result.total);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setData([]);
          setTotal(0);
          setError(
            failure instanceof Error
              ? failure.message
              : "Không tải được nhật ký",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, pagination, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setSecurityLoading(true);
    setSecurityError("");
    workflowJson<SecuritySummary>("/api/activity/security", {
      signal: controller.signal,
    })
      .then(setSecurity)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setSecurityError(
            failure instanceof Error
              ? failure.message
              : "Không tải được cảnh báo an ninh",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSecurityLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setSessionsLoading(true);
    setSessionsError("");
    workflowJson<{ data: SessionDevice[] }>("/api/activity/sessions", {
      signal: controller.signal,
    })
      .then((result) => setSessions(result.data))
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setSessionsError(
            failure instanceof Error
              ? failure.message
              : "Không tải được phiên đăng nhập",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSessionsLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!selected) {
      setRelated([]);
      return;
    }
    const controller = new AbortController();
    setRelatedLoading(true);
    setRelatedError("");
    workflowJson<{ data: ActivityEntry[] }>(
      `/api/activity/${encodeURIComponent(selected.id)}/related`,
      { signal: controller.signal },
    )
      .then((result) => setRelated(result.data))
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setRelatedError(
            failure instanceof Error
              ? failure.message
              : "Không tải được hoạt động liên quan",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setRelatedLoading(false);
      });
    return () => controller.abort();
  }, [selected?.id]);

  function applyFilters(values: ActivityFilters) {
    const next = { ...emptyFilters, ...values };
    if (next.from && next.to && next.from > next.to) {
      setError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
      return;
    }
    setFilters(next);
    setPagination((previous) => ({ ...previous, page: 1 }));
  }

  async function updateSecurityAlertStatus(
    id: string,
    status: SecurityAlertStatus,
  ) {
    setSecurityActionId(id);
    try {
      await workflowJson(`/api/activity/security/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setRefresh((value) => value + 1);
    } catch (failure) {
      setSecurityError(
        failure instanceof Error
          ? failure.message
          : "Không cập nhật được cảnh báo",
      );
    } finally {
      setSecurityActionId(null);
    }
  }

  async function revokeSession(sessionId: string) {
    setSessionActionId(sessionId);
    try {
      await workflowJson(`/api/activity/sessions/${sessionId}`, {
        method: "DELETE",
      });
      setRefresh((value) => value + 1);
    } catch (failure) {
      setSessionsError(
        failure instanceof Error ? failure.message : "Không thu hồi được phiên",
      );
    } finally {
      setSessionActionId(null);
    }
  }

  const diffRows = useMemo(() => {
    if (!selected?.metadata) return [];
    return [
      ...buildDiffRows(selected.metadata.before, selected.metadata.after),
      ...buildChangeListRows(selected.metadata.changes),
    ];
  }, [selected]);

  const detailMetadata = useMemo(() => {
    if (!selected?.metadata) return null;
    const entries = Object.entries(selected.metadata).filter(
      ([key]) => key !== "before" && key !== "after",
    );
    return entries.length ? Object.fromEntries(entries) : null;
  }, [selected]);

  return (
    <div className="workspace-page">
      <PageTitle>Nhật ký hoạt động</PageTitle>
      <Typography.Paragraph type="secondary">
        Tra cứu người thực hiện, đối tượng, mã yêu cầu, mã blockchain và kết quả
        xử lý trong phạm vi nhà trường. Nhật ký chỉ được xem, không chỉnh sửa
        hoặc xóa.
      </Typography.Paragraph>

      <Card
        className="mb-5"
        size="small"
        title={
          <Space>
            <WarningOutlined />
            <span>Cảnh báo đăng nhập và spam trong 24 giờ</span>
          </Space>
        }
        loading={securityLoading}
      >
        {securityError && (
          <Alert showIcon type="warning" message={securityError} />
        )}
        {security && (
          <>
            <Space wrap size={24} className="mb-4">
              <Statistic
                title="Đăng nhập thất bại"
                value={security.failedLogins}
              />
              <Statistic
                title="Request bị chặn"
                value={security.rateLimitedRequests}
              />
              <Statistic
                title="Cảnh báo đang có"
                value={security.alerts.length}
              />
              <Typography.Text type="secondary">
                Cập nhật lúc {timeLabel(security.generatedAt)}
              </Typography.Text>
            </Space>
            {security.alerts.length ? (
              <List
                bordered
                size="small"
                dataSource={security.alerts}
                renderItem={(alert) => (
                  <SecurityAlertItem
                    alert={alert}
                    onStatusChange={updateSecurityAlertStatus}
                    statusLoading={securityActionId === alert.id}
                  />
                )}
              />
            ) : (
              <Alert
                showIcon
                type="success"
                message="Chưa phát hiện đăng nhập bất thường trong 24 giờ gần nhất"
                description="Hệ thống vẫn ghi nhận nhật ký thất bại để phục vụ kiểm tra sau này."
              />
            )}
          </>
        )}
      </Card>

      <Card
        className="mb-5"
        size="small"
        title="Phiên đăng nhập và thiết bị"
        loading={sessionsLoading}
      >
        {sessionsError && (
          <Alert showIcon type="warning" message={sessionsError} />
        )}
        {!sessionsLoading && sessions.length === 0 && !sessionsError && (
          <Alert
            showIcon
            type="info"
            message="Không có phiên đăng nhập đang hoạt động"
          />
        )}
        {sessions.length > 0 && (
          <List
            bordered
            size="small"
            dataSource={sessions}
            renderItem={(session) => (
              <List.Item
                actions={[
                  <Button
                    key="revoke"
                    danger
                    size="small"
                    disabled={session.current}
                    loading={sessionActionId === session.id}
                    onClick={() =>
                      Modal.confirm({
                        title: "Thu hồi phiên đăng nhập này?",
                        content:
                          "Thiết bị sẽ phải đăng nhập lại ở lần truy cập tiếp theo.",
                        okText: "Thu hồi",
                        okButtonProps: { danger: true },
                        cancelText: "Hủy",
                        onOk: () => revokeSession(session.id),
                      })
                    }
                  >
                    {session.current ? "Đang dùng" : "Thu hồi"}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space wrap>
                      <Typography.Text strong>
                        {session.current
                          ? "Thiết bị hiện tại"
                          : "Phiên đăng nhập"}
                      </Typography.Text>
                      {session.current && <Tag color="blue">Đang dùng</Tag>}
                      {session.ip && <Tag>{session.ip}</Tag>}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={2}>
                      <Typography.Text className="break-all">
                        {sessionAgentLabel(session.userAgent)}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        Tạo lúc {timeLabel(session.createdAt)} · hết hạn lúc{" "}
                        {timeLabel(session.expiresAt)}
                      </Typography.Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      <Form
        form={form}
        layout="vertical"
        initialValues={emptyFilters}
        onFinish={applyFilters}
      >
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 xl:grid-cols-5">
          <Form.Item name="search" label="Người thực hiện / đối tượng">
            <Input
              allowClear
              maxLength={255}
              placeholder="Email, mã hồ sơ hoặc mã blockchain"
            />
          </Form.Item>
          <Form.Item name="action" label="Hoạt động">
            <Select
              allowClear
              placeholder="Tất cả"
              options={Object.entries(activityLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item name="result" label="Kết quả">
            <Select
              allowClear
              placeholder="Tất cả"
              options={[
                { value: "SUCCESS", label: "Thành công" },
                { value: "FAILED", label: "Thất bại" },
              ]}
            />
          </Form.Item>
          <Form.Item name="from" label="Từ ngày">
            <Input type="date" />
          </Form.Item>
          <Form.Item name="to" label="Đến ngày">
            <Input type="date" />
          </Form.Item>
        </div>
        <Space wrap className="mb-5">
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
            Tra cứu
          </Button>
          <Button
            onClick={() => {
              form.resetFields();
              setFilters(emptyFilters);
              setPagination({ page: 1, limit: 20 });
            }}
          >
            Xóa bộ lọc
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setRefresh((value) => value + 1)}
            loading={loading || securityLoading}
          >
            Tải lại
          </Button>
        </Space>
      </Form>

      {error && (
        <Alert showIcon type="error" message={error} className="mb-4" />
      )}
      <Table<ActivityEntry>
        rowKey="id"
        dataSource={data}
        loading={loading}
        scroll={{ x: 1150 }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.limit,
          total,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100],
          showTotal: (count) => `${count} hoạt động`,
          onChange: (page, limit) => setPagination({ page, limit }),
        }}
        columns={[
          {
            title: "Thời điểm",
            dataIndex: "createdAt",
            render: timeLabel,
            width: 180,
          },
          { title: "Người thực hiện", dataIndex: "actorEmail" },
          {
            title: "Hoạt động",
            dataIndex: "action",
            render: (value: string) => activityLabels[value] || value,
          },
          {
            title: "Đối tượng",
            key: "target",
            width: 310,
            render: (_, entry: ActivityEntry) => (
              <Space direction="vertical" size={0}>
                <Typography.Text
                  ellipsis={{
                    tooltip: entry.targetLabel || entry.target || undefined,
                  }}
                >
                  {entry.targetLabel || entry.target || "—"}
                </Typography.Text>
                {entry.targetLabel && entry.target && (
                  <Typography.Text
                    type="secondary"
                    className="text-xs"
                    copyable={{ text: entry.target }}
                  >
                    {entry.target}
                  </Typography.Text>
                )}
              </Space>
            ),
          },
          {
            title: "Kết quả",
            dataIndex: "result",
            render: (value: string) => (
              <Tag color={value === "SUCCESS" ? "green" : "red"}>
                {value === "SUCCESS" ? "Thành công" : "Thất bại"}
              </Tag>
            ),
          },
          {
            title: "Chi tiết",
            key: "detail",
            render: (_, entry) => (
              <Button size="small" onClick={() => setSelected(entry)}>
                Xem
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title="Chi tiết hoạt động"
        open={!!selected}
        onCancel={() => setSelected(null)}
        footer={null}
        width={960}
      >
        {selected && (
          <Space direction="vertical" size={16} className="w-full">
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Mã nhật ký">
                <CodeValue value={selected.id} />
              </Descriptions.Item>
              <Descriptions.Item label="Thời điểm">
                {timeLabel(selected.createdAt)}
              </Descriptions.Item>
              <Descriptions.Item label="Người thực hiện">
                {selected.actorEmail}
              </Descriptions.Item>
              <Descriptions.Item label="Hoạt động">
                {activityLabels[selected.action] || selected.action}
              </Descriptions.Item>
              <Descriptions.Item label="Nhóm đối tượng">
                {selected.targetKind
                  ? targetKindLabels[selected.targetKind] || selected.targetKind
                  : "Không xác định"}
              </Descriptions.Item>
              <Descriptions.Item label="Đối tượng dễ hiểu">
                <Space direction="vertical" size={2}>
                  <Typography.Text strong>
                    {selected.targetLabel ||
                      selected.target ||
                      "Không có dữ liệu"}
                  </Typography.Text>
                  {selected.target && <CodeValue value={selected.target} />}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Kết quả">
                <Tag color={selected.result === "SUCCESS" ? "green" : "red"}>
                  {selected.result === "SUCCESS" ? "Thành công" : "Thất bại"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Mã tài khoản">
                <CodeValue value={selected.actorId} />
              </Descriptions.Item>
              <Descriptions.Item label="Mã đơn vị">
                <CodeValue value={selected.institutionId} />
              </Descriptions.Item>
              <Descriptions.Item label="Địa chỉ IP">
                <CodeValue value={selected.ip} />
              </Descriptions.Item>
              <Descriptions.Item label="Thiết bị / trình duyệt">
                {selected.userAgent || "Không có dữ liệu"}
              </Descriptions.Item>
            </Descriptions>

            {selected.errorMessage && (
              <Alert
                showIcon
                type="error"
                message="Chi tiết lỗi"
                description={selected.errorMessage}
              />
            )}

            <Card size="small" title="Mã tham chiếu liên quan">
              {selected.references.length ? (
                <List
                  size="small"
                  bordered
                  dataSource={selected.references}
                  renderItem={(reference) => (
                    <List.Item>
                      <Space wrap>
                        <Tag>
                          {referenceKindLabels[reference.kind] ||
                            reference.kind}
                        </Tag>
                        <Typography.Text>{reference.label}</Typography.Text>
                        <CodeValue value={reference.value} />
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Không có mã tham chiếu bổ sung"
                />
              )}
            </Card>

            {(selected.metadata?.before !== undefined ||
              selected.metadata?.after !== undefined ||
              Array.isArray(selected.metadata?.changes)) && (
              <Card size="small" title="So sánh trước và sau thay đổi">
                {diffRows.length ? (
                  <Table<DiffRow>
                    rowKey="key"
                    size="small"
                    pagination={false}
                    scroll={{ x: 650 }}
                    dataSource={diffRows}
                    columns={[
                      { title: "Trường", dataIndex: "field", width: 220 },
                      {
                        title: "Trước thay đổi",
                        dataIndex: "before",
                        render: (value: unknown, row) => (
                          <MetadataValue fieldKey={row.field} value={value} />
                        ),
                      },
                      {
                        title: "Sau thay đổi",
                        dataIndex: "after",
                        render: (value: unknown, row) => (
                          <MetadataValue fieldKey={row.field} value={value} />
                        ),
                      },
                    ]}
                  />
                ) : (
                  <Alert
                    type="info"
                    message="Không có trường dữ liệu khác nhau"
                  />
                )}
              </Card>
            )}

            {detailMetadata && (
              <Card size="small" title="Thông tin ghi nhận">
                <MetadataValue fieldKey="metadata" value={detailMetadata} />
              </Card>
            )}

            <Card
              size="small"
              title={`Chuỗi hoạt động liên quan${related.length ? ` (${related.length})` : ""}`}
            >
              {relatedError && (
                <Alert showIcon type="warning" message={relatedError} />
              )}
              {relatedLoading ? (
                <Typography.Text type="secondary">
                  Đang tải hoạt động liên quan...
                </Typography.Text>
              ) : related.length ? (
                <List
                  size="small"
                  bordered
                  dataSource={related}
                  renderItem={(entry) => (
                    <List.Item
                      actions={[
                        <Button
                          key="view"
                          type="link"
                          size="small"
                          onClick={() => setSelected(entry)}
                        >
                          Xem
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space wrap>
                            <Typography.Text>
                              {timeLabel(entry.createdAt)}
                            </Typography.Text>
                            <Tag>
                              {activityLabels[entry.action] || entry.action}
                            </Tag>
                            <Tag
                              color={
                                entry.result === "SUCCESS" ? "green" : "red"
                              }
                            >
                              {entry.result === "SUCCESS"
                                ? "Thành công"
                                : "Thất bại"}
                            </Tag>
                          </Space>
                        }
                        description={
                          <Space direction="vertical" size={0}>
                            <Typography.Text>
                              {entry.targetLabel ||
                                entry.target ||
                                "Không có đối tượng"}
                            </Typography.Text>
                            <Typography.Text type="secondary">
                              {entry.actorEmail}
                            </Typography.Text>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Chưa tìm thấy hoạt động liên quan"
                />
              )}
            </Card>
          </Space>
        )}
      </Modal>
    </div>
  );
}
