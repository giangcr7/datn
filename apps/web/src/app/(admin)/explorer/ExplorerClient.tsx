"use client";

import PageTitle from "@/components/PageTitle";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  EyeOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { getWorkspace, type WorkspaceUser } from "@/lib/workspace-access";
import {
  anchorParams,
  anchorStatuses,
  comparisonStatuses,
  eventLabel,
  networkStatuses,
  type AnchorComparison,
  type AnchorEntry,
  type AnchorFilters,
  type AnchorPage,
  type ExplorerOverview,
} from "@/lib/explorer";

const emptyFilters: AnchorFilters = { search: "", eventType: "", status: "" };
const formatTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("vi-VN") : "Chưa ghi nhận";

export default function ExplorerClient({ user }: { user: WorkspaceUser }) {
  const workspace = getWorkspace(user);
  const [overview, setOverview] = useState<ExplorerOverview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [rows, setRows] = useState<AnchorEntry[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  });
  const [filters, setFilters] = useState<AnchorFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<AnchorFilters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<AnchorEntry | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<AnchorEntry | null>(null);
  const [retryReason, setRetryReason] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const [comparisons, setComparisons] = useState<
    Record<string, AnchorComparison>
  >({});
  const requestId = useRef(0);
  const overviewRequestId = useRef(0);

  const loadOverview = useCallback(async () => {
    const current = ++overviewRequestId.current;
    setOverviewLoading(true);
    setOverviewError("");
    try {
      const response = await fetch("/api/explorer/overview", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.error || "Không tải được tổng quan");
      if (current === overviewRequestId.current) setOverview(result.data);
    } catch (error) {
      if (current !== overviewRequestId.current) return;
      setOverview(null);
      setOverviewError(
        error instanceof Error ? error.message : "Không tải được tổng quan",
      );
    } finally {
      if (current === overviewRequestId.current) setOverviewLoading(false);
    }
  }, []);

  const loadAnchors = useCallback(
    async (nextFilters: AnchorFilters, page = 1, limit = 20) => {
      const current = ++requestId.current;
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch(
          "/api/explorer/anchors?" + anchorParams(nextFilters, page, limit),
          { cache: "no-store" },
        );
        const result: AnchorPage & { success: boolean; error?: string } =
          await response.json();
        if (!response.ok || !result.success)
          throw new Error(result.error || "Không tải được giao dịch");
        if (current !== requestId.current) return;
        setRows(result.data);
        setPagination(result.pagination);
      } catch (error) {
        if (current !== requestId.current) return;
        setRows([]);
        setPagination({ total: 0, page: 1, limit, totalPages: 0 });
        setLoadError(
          error instanceof Error ? error.message : "Không tải được giao dịch",
        );
      } finally {
        if (current === requestId.current) setLoading(false);
      }
    },
    [],
  );

  const cancelPending = useCallback(() => {
    requestId.current++;
    overviewRequestId.current++;
  }, []);
  useEffect(() => {
    void loadOverview();
    void loadAnchors(emptyFilters);
    return cancelPending;
  }, [loadOverview, loadAnchors, cancelPending]);

  const apply = (nextFilters: AnchorFilters) => {
    setAppliedFilters({ ...nextFilters });
    setComparisons({});
    void loadAnchors(nextFilters, 1, pagination.limit);
  };

  const refresh = () => {
    setComparisons({});
    void loadOverview();
    void loadAnchors(appliedFilters, pagination.page, pagination.limit);
  };

  const checkAnchor = async (entry: AnchorEntry) => {
    if (checking) return;
    setSelected(entry);
    setChecking(entry.id);
    setComparisons((previous) => {
      const next = { ...previous };
      delete next[entry.id];
      return next;
    });
    try {
      const response = await fetch(
        "/api/explorer/anchors/" + encodeURIComponent(entry.id) + "/check",
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.error || "Không thực hiện được đối chiếu");
      setComparisons((previous) => ({ ...previous, [entry.id]: result.data }));
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : "Không thực hiện được đối chiếu",
      );
    } finally {
      setChecking(null);
    }
  };

  const retryAnchor = async () => {
    if (!retryTarget?.outbox || retrying) return;
    if (retryReason.trim().length < 10) {
      setRetryError("Nhập lý do xử lý từ 10 đến 2000 ký tự.");
      return;
    }
    setRetrying(true);
    setRetryError("");
    try {
      const response = await fetch(
        "/api/explorer/anchors/" +
          encodeURIComponent(retryTarget.id) +
          "/retry",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: retryReason.trim(),
            expectedRetryToken: retryTarget.outbox.retryToken,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.error || "Không khôi phục được giao dịch");
      setSelected(result.data.anchor);
      setRetryTarget(null);
      setRetryReason("");
      message.success(result.data.message);
      refresh();
    } catch (error) {
      setRetryError(
        error instanceof Error
          ? error.message
          : "Không khôi phục được giao dịch",
      );
    } finally {
      setRetrying(false);
    }
  };

  const columns: TableColumnsType<AnchorEntry> = [
    {
      title: "Văn bằng",
      key: "diploma",
      width: 260,
      render: (_value, entry) => (
        <>
          <Typography.Text strong>
            {entry.fullName || "Chưa có họ tên"}
          </Typography.Text>
          <div>MSSV: {entry.mssv || "—"}</div>
          <Typography.Text type="secondary">
            Số hiệu: {entry.certificateNo || "—"}
            <br />
            Số vào sổ: {entry.registryNo || "—"}
          </Typography.Text>
        </>
      ),
    },
    {
      title: "Nghiệp vụ",
      key: "event",
      width: 130,
      render: (_value, entry) => (
        <>
          <Tag color={entry.eventType === "REVOKE" ? "red" : "blue"}>
            {eventLabel(entry.eventType)}
          </Tag>
          <div>Phiên bản {entry.version}</div>
        </>
      ),
    },
    {
      title: "Đồng bộ",
      key: "status",
      width: 160,
      render: (_value, entry) => (
        <>
          <Tag color={anchorStatuses[entry.status]?.color}>
            {anchorStatuses[entry.status]?.label || entry.status}
          </Tag>
          {entry.outbox?.exhausted && <Tag color="red">Hết lượt thử lại</Tag>}
          {entry.outbox && (
            <div>
              <Typography.Text type="secondary">
                Đợt hiện tại: {entry.outbox.attempts} lần thử
              </Typography.Text>
            </div>
          )}
        </>
      ),
    },
    {
      title: "Mã giao dịch",
      dataIndex: "transactionId",
      width: 210,
      render: (value: string | null) =>
        value ? (
          <Typography.Text
            copyable={{ text: value }}
            ellipsis={{ tooltip: value }}
            style={{ width: 185 }}
          >
            {value}
          </Typography.Text>
        ) : (
          "Chưa có mã giao dịch"
        ),
    },
    {
      title: "Ghi nhận lúc",
      dataIndex: "committedAt",
      width: 175,
      render: formatTime,
    },
    {
      title: "Đối chiếu trực tiếp",
      key: "comparison",
      width: 180,
      render: (_value, entry) => {
        const result = comparisons[entry.id];
        return result ? (
          <Tag color={comparisonStatuses[result.status]?.color}>
            {comparisonStatuses[result.status]?.label || result.status}
          </Tag>
        ) : (
          <Typography.Text type="secondary">
            Chưa đối chiếu trong phiên này
          </Typography.Text>
        );
      },
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 215,
      render: (_value, entry) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setSelected(entry)}
          >
            Chi tiết
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<SafetyCertificateOutlined />}
            loading={checking === entry.id}
            disabled={!!checking && checking !== entry.id}
            onClick={() => void checkAnchor(entry)}
          >
            Đối chiếu
          </Button>
        </Space>
      ),
    },
  ];
  const comparison = selected ? comparisons[selected.id] : undefined;
  const network = networkStatuses[overview?.networkStatus || ""] || {
    label: "Chưa xác định kết nối Fabric",
    color: "default",
  };
  const activeFilter = !!(
    appliedFilters.search.trim() ||
    appliedFilters.eventType ||
    appliedFilters.status
  );

  return (
    <div className="workspace-page">
      <div className="flex flex-wrap justify-between gap-4 mb-6">
        <div>
          <PageTitle>
            {workspace.kind === "admin"
              ? "Giám sát blockchain"
              : "Đối chiếu blockchain"}
          </PageTitle>
          <Typography.Text type="secondary">
            Theo dõi giao dịch phát hành, thu hồi và đối chiếu dữ liệu văn bằng
            với Hyperledger Fabric.
          </Typography.Text>
        </div>
        <Space wrap>
          <Tag color={network.color}>{network.label}</Tag>
          <Button
            icon={<ReloadOutlined />}
            loading={loading || overviewLoading}
            disabled={!!checking}
            onClick={refresh}
          >
            Làm mới
          </Button>
        </Space>
      </div>
      {overviewError && (
        <Alert type="warning" showIcon title={overviewError} className="mb-4" />
      )}
      <Row gutter={[16, 16]} className="mb-6">
        {[
          ["Đã ghi nhận", overview?.totalTransactions],
          ["Chờ / đang đồng bộ", overview?.pendingAnchors],
          ["Lỗi đồng bộ", overview?.failedAnchors],
        ].map(([title, value]) => (
          <Col xs={24} md={8} key={String(title)}>
            <Card loading={overviewLoading}>
              <Statistic title={title} value={value ?? "—"} />
            </Card>
          </Col>
        ))}
      </Row>
      <Alert
        type="info"
        showIcon
        title="Trạng thái đồng bộ lấy từ chỉ mục giao dịch. Nhấn Đối chiếu để đọc trực tiếp blockchain; kết quả không thay thế việc xác thực file PDF và chữ ký số."
        className="mb-6"
      />
      <Form layout="vertical" onFinish={() => apply(filters)}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4">
          <Form.Item label="Tra cứu giao dịch" htmlFor="anchor-search">
            <Input
              id="anchor-search"
              allowClear
              maxLength={255}
              placeholder="Họ tên, MSSV, số hiệu, số vào sổ, mã giao dịch"
              value={filters.search}
              onChange={(event) =>
                setFilters((previous) => ({
                  ...previous,
                  search: event.target.value,
                }))
              }
            />
          </Form.Item>
          <Form.Item label="Nghiệp vụ" htmlFor="anchor-event">
            <Select
              id="anchor-event"
              allowClear
              placeholder="Tất cả nghiệp vụ"
              value={filters.eventType || undefined}
              options={["ISSUE", "REVOKE"].map((value) => ({
                value,
                label: eventLabel(value),
              }))}
              onChange={(value) =>
                setFilters((previous) => ({
                  ...previous,
                  eventType: value || "",
                }))
              }
            />
          </Form.Item>
          <Form.Item label="Trạng thái đồng bộ" htmlFor="anchor-status">
            <Select
              id="anchor-status"
              allowClear
              placeholder="Tất cả trạng thái"
              value={filters.status || undefined}
              options={Object.entries(anchorStatuses).map(
                ([value, status]) => ({ value, label: status.label }),
              )}
              onChange={(value) =>
                setFilters((previous) => ({ ...previous, status: value || "" }))
              }
            />
          </Form.Item>
        </div>
        <Space wrap className="mb-4">
          <Button htmlType="submit" type="primary" loading={loading}>
            Tra cứu
          </Button>
          <Button
            onClick={() => {
              setFilters(emptyFilters);
              apply(emptyFilters);
            }}
          >
            Xóa bộ lọc
          </Button>
          <Typography.Text type="secondary">
            {activeFilter
              ? "Kết quả theo bộ lọc đã áp dụng"
              : "Tất cả giao dịch của nhà trường"}{" "}
            · {pagination.total} giao dịch
          </Typography.Text>
        </Space>
      </Form>
      {loadError && (
        <Alert type="error" showIcon title={loadError} className="mb-4" />
      )}
      <Table<AnchorEntry>
        rowKey="id"
        dataSource={rows}
        columns={columns}
        loading={loading}
        size="small"
        bordered
        scroll={{ x: 1450 }}
        locale={{
          emptyText: loadError
            ? "Chưa tải được giao dịch"
            : "Không có giao dịch phù hợp. Hồ sơ chưa duyệt được xử lý tại Hồ sơ cấp văn bằng.",
        }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.limit,
          total: pagination.total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          showTotal: (total) => `Tổng ${total} giao dịch`,
          onChange: (page, limit) =>
            void loadAnchors(appliedFilters, page, limit),
        }}
      />
      {overview && (
        <Typography.Paragraph type="secondary" className="mt-4">
          Cập nhật chỉ mục: {formatTime(overview.lastUpdated)}
        </Typography.Paragraph>
      )}
      <Modal
        open={!!selected}
        onCancel={() => setSelected(null)}
        title="Chi tiết và đối chiếu giao dịch"
        width={820}
        footer={
          selected ? (
            <Space>
              {selected.outbox?.exhausted && selected.status === "FAILED" && (
                <Button
                  icon={<ReloadOutlined />}
                  disabled={!!checking || retrying}
                  onClick={() => {
                    setRetryTarget(selected);
                    setRetryReason("");
                    setRetryError("");
                  }}
                >
                  Khôi phục giao dịch
                </Button>
              )}
              <Button
                loading={checking === selected.id}
                disabled={!!checking && checking !== selected.id}
                type="primary"
                onClick={() => void checkAnchor(selected)}
              >
                Đối chiếu lại
              </Button>
              <Button onClick={() => setSelected(null)}>Đóng</Button>
            </Space>
          ) : null
        }
      >
        {selected && (
          <>
            <Descriptions
              column={1}
              bordered
              size="small"
              items={[
                {
                  key: "name",
                  label: "Văn bằng",
                  children: selected.fullName || "—",
                },
                {
                  key: "number",
                  label: "Số hiệu / số vào sổ",
                  children: `${selected.certificateNo || "—"} / ${selected.registryNo || "—"}`,
                },
                {
                  key: "event",
                  label: "Nghiệp vụ",
                  children: `${eventLabel(selected.eventType)} · Phiên bản ${selected.version}`,
                },
                {
                  key: "status",
                  label: "Trạng thái đồng bộ",
                  children:
                    anchorStatuses[selected.status]?.label || selected.status,
                },
                {
                  key: "tx",
                  label: "Mã giao dịch",
                  children: selected.transactionId ? (
                    <Typography.Text
                      copyable
                      style={{ wordBreak: "break-all" }}
                    >
                      {selected.transactionId}
                    </Typography.Text>
                  ) : (
                    "Chưa ghi nhận"
                  ),
                },
                {
                  key: "block",
                  label: "Số khối",
                  children:
                    selected.blockNumber ?? "Chưa được chỉ mục ghi nhận",
                },
                {
                  key: "time",
                  label: "Ghi nhận lúc",
                  children: formatTime(selected.committedAt),
                },
                {
                  key: "outbox",
                  label: "Đồng bộ tự động",
                  children: selected.outbox
                    ? `${selected.outbox.status === "FAILED" ? "Đã dừng thử lại; kiểm tra lỗi trước khi khôi phục" : selected.outbox.status === "COMPLETED" ? "Đã hoàn tất" : selected.outbox.status === "PROCESSING" ? "Đang xử lý" : "Đang chờ xử lý"} · ${selected.outbox.attempts} lần thử trong đợt hiện tại`
                    : "Không có tác vụ đồng bộ trong chỉ mục",
                },
                ...(selected.outbox?.status === "PENDING"
                  ? [
                      {
                        key: "next",
                        label: "Lịch thử lại",
                        children: formatTime(selected.outbox.availableAt),
                      },
                    ]
                  : []),
                {
                  key: "error",
                  label: "Lỗi gần nhất",
                  children: selected.lastError ? (
                    <Typography.Text
                      type="danger"
                      style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {selected.lastError}
                    </Typography.Text>
                  ) : (
                    "Không có"
                  ),
                },
              ]}
            />
            {!!selected.retryHistory?.length && (
              <div className="mt-4">
                <Typography.Title level={5}>
                  Lịch sử khôi phục gần đây
                </Typography.Title>
                {selected.retryHistory.map((item) => (
                  <Card
                    key={item.id}
                    size="small"
                    className="mb-2"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    <Typography.Text strong>
                      {formatTime(item.createdAt)} · {item.actorEmail}
                    </Typography.Text>
                    <div>Lý do: {item.reason}</div>
                    <div>Đợt trước: {item.previousAttempts} lần thử.</div>
                    {item.previousError && (
                      <Typography.Paragraph
                        style={{
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                        type="secondary"
                      >
                        Lỗi đã lưu: {item.previousError}
                      </Typography.Paragraph>
                    )}
                  </Card>
                ))}
              </div>
            )}
            {selected.status === "COMMITTED" && (
              <Typography.Paragraph className="mt-4">
                <Link
                  href={
                    "/certificates?search=" +
                    encodeURIComponent(
                      selected.certificateNo || selected.mssv || "",
                    )
                  }
                >
                  Tra trong Sổ văn bằng
                </Link>
              </Typography.Paragraph>
            )}
            {checking === selected.id && (
              <Alert
                type="info"
                showIcon
                title="Đang đọc trực tiếp blockchain để đối chiếu..."
                className="mt-4"
              />
            )}
            {comparison && (
              <div className="mt-4">
                <Alert
                  showIcon
                  type={
                    comparison.status === "MATCH"
                      ? "success"
                      : comparison.status === "MISMATCH"
                        ? "error"
                        : "warning"
                  }
                  title={
                    comparisonStatuses[comparison.status]?.label ||
                    comparison.status
                  }
                  description={comparison.message}
                />
                <Typography.Paragraph type="secondary" className="mt-2">
                  Thời điểm đối chiếu: {formatTime(comparison.checkedAt)}. Không
                  tự sửa dữ liệu hoặc gửi giao dịch mới.
                </Typography.Paragraph>
                <Descriptions
                  bordered
                  column={1}
                  size="small"
                  items={comparison.checks.map((check) => ({
                    key: check.key,
                    label: check.label,
                    children: (
                      <Tag
                        color={
                          check.matched === true
                            ? "green"
                            : check.matched === false
                              ? "red"
                              : "default"
                        }
                      >
                        {check.matched === true
                          ? "Khớp"
                          : check.matched === false
                            ? "Chưa khớp"
                            : "Chưa đủ dữ liệu"}
                      </Tag>
                    ),
                  }))}
                />
              </div>
            )}
          </>
        )}
      </Modal>
      <Modal
        title="Khôi phục giao dịch hết lượt thử lại"
        open={!!retryTarget}
        confirmLoading={retrying}
        okText="Xác nhận đưa vào hàng đợi"
        cancelText="Hủy"
        closable={!retrying}
        maskClosable={!retrying}
        keyboard={!retrying}
        cancelButtonProps={{ disabled: retrying }}
        onCancel={() => {
          if (!retrying) setRetryTarget(null);
        }}
        onOk={() => void retryAnchor()}
      >
        <Alert
          showIcon
          type="warning"
          title="Kiểm tra và khắc phục nguyên nhân lỗi trước khi tiếp tục."
          description="Tác vụ gốc được thử lại tối đa 10 lần. Không tạo văn bằng mới, không sửa PDF hoặc dữ liệu đã ký và không tự xác nhận blockchain thành công. Nếu giao dịch đã ghi nhận nhưng mất phản hồi, hệ thống sử dụng lại kết quả gốc khi Fabric xác nhận."
        />
        <Typography.Paragraph className="mt-4">
          {retryTarget?.fullName} ·{" "}
          {retryTarget ? eventLabel(retryTarget.eventType) : ""} ·{" "}
          {retryTarget?.certificateNo}
        </Typography.Paragraph>
        {retryTarget?.lastError && (
          <Typography.Paragraph
            type="danger"
            style={{ overflowWrap: "anywhere" }}
          >
            {retryTarget.lastError}
          </Typography.Paragraph>
        )}
        <label htmlFor="anchor-retry-reason">Lý do và biện pháp đã xử lý</label>
        <Input.TextArea
          id="anchor-retry-reason"
          value={retryReason}
          disabled={retrying}
          maxLength={2000}
          showCount
          rows={4}
          onChange={(event) => setRetryReason(event.target.value)}
          placeholder="Ví dụ: Đã khôi phục kết nối peer và kiểm tra lại cấu hình MSP."
        />
        {retryError && (
          <Alert className="mt-4" showIcon type="error" title={retryError} />
        )}
      </Modal>
    </div>
  );
}
