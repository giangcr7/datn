"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
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
  CheckCircleOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import PageTitle from "@/components/PageTitle";

type AlertItem = {
  id: string;
  diplomaId: string;
  type: string;
  riskScore: number;
  severity: string;
  ruleVersion: string;
  evidence: Record<string, unknown> | null;
  note: string | null;
  resolvedAt: string | null;
  createdAt: string;
  lastSeenAt: string;
  diploma?: {
    certificateNo: string;
    registryNo: string;
    status: string;
    workflowStatus: string;
    graduation?: {
      student?: { studentCode: string; fullName: string };
    };
  };
};

type AnomalyResponse = {
  items: AlertItem[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  ruleVersion: string;
  generatedAt: string;
};

const severityColor: Record<string, string> = {
  CRITICAL: "red",
  HIGH: "volcano",
  MEDIUM: "orange",
  LOW: "blue",
};

const typeLabels: Record<string, string> = {
  ANOMALY_RISK: "Tổng hợp rủi ro",
  HASH_MISMATCH: "Sai lệch hash",
  ANCHOR_PENDING_TOO_LONG: "Anchor treo quá lâu",
  ANCHOR_NOT_COMMITTED: "Anchor chưa committed",
  ANCHOR_FAILURE_PATTERN: "Anchor lỗi",
  MULTIPLE_ACTIVE_DIPLOMAS: "Nhiều văn bằng ACTIVE",
  POST_APPROVAL_MUTATION: "Thay đổi sau duyệt",
  VERSION_CHURN: "Đổi phiên bản nhiều",
  ISSUE_BURST: "Burst phát hành",
};

const formatTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("vi-VN") : "Chưa ghi nhận";

export default function AnomaliesClient() {
  const [resolved, setResolved] = useState(false);
  const [severity, setSeverity] = useState<string | undefined>();
  const [data, setData] = useState<AnomalyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AlertItem | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        resolved: String(resolved),
        limit: "200",
      });
      if (severity) params.set("severity", severity);
      const response = await fetch(`/api/integrity/anomalies?${params}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Không tải được cảnh báo");
      setData(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Không tải được cảnh báo",
      );
    } finally {
      setLoading(false);
    }
  }, [resolved, severity]);

  useEffect(() => {
    void load();
  }, [load]);

  const runScan = async () => {
    setScanning(true);
    try {
      const response = await fetch(
        "/api/integrity/anomaly-scan?days=7&limit=500",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không chạy được scan");
      message.success(
        `Đã quét ${result.scanned} hồ sơ, tạo mới ${result.created} cảnh báo`,
      );
      await load();
    } catch (scanError) {
      message.error(
        scanError instanceof Error
          ? scanError.message
          : "Không chạy được scan",
      );
    } finally {
      setScanning(false);
    }
  };

  const updateStatus = async (item: AlertItem, action: "resolve" | "reopen") => {
    if (!note.trim()) {
      message.warning("Hãy nhập ghi chú xử lý");
      return;
    }
    try {
      const response = await fetch(
        `/api/integrity/anomalies/${item.id}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note.trim() }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Không cập nhật được trạng thái");
      message.success(
        action === "resolve"
          ? "Đã xác nhận xử lý cảnh báo"
          : "Đã mở lại cảnh báo",
      );
      setNote("");
      setSelected(null);
      await load();
    } catch (statusError) {
      message.error(
        statusError instanceof Error
          ? statusError.message
          : "Không cập nhật được trạng thái",
      );
    }
  };

  const columns: TableColumnsType<AlertItem> = [
    {
      title: "Mức độ",
      dataIndex: "severity",
      width: 120,
      render: (value: string, item) => (
        <Space direction="vertical" size={0}>
          <Tag color={severityColor[value] || "default"}>{value}</Tag>
          <Typography.Text strong>{item.riskScore}/100</Typography.Text>
        </Space>
      ),
    },
    {
      title: "Tín hiệu",
      dataIndex: "type",
      render: (value: string) => typeLabels[value] || value,
    },
    {
      title: "Văn bằng",
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>
            {item.diploma?.graduation?.student?.fullName || "Không rõ"}
          </Typography.Text>
          <Typography.Text type="secondary">
            {item.diploma?.certificateNo || item.diplomaId}
          </Typography.Text>
        </Space>
      ),
    },
    { title: "Lần cuối thấy", dataIndex: "lastSeenAt", render: formatTime },
    {
      title: "Thao tác",
      width: 110,
      render: (_, item) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => setSelected(item)}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  const summary = data?.summary;
  return (
    <div className="workspace-page">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <PageTitle>Phát hiện bất thường</PageTitle>
          <Typography.Text type="secondary">
            Rule version: {data?.ruleVersion || "rules-v1"} · Chỉ cảnh báo, không tự sửa dữ liệu
          </Typography.Text>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void load()}
            loading={loading}
          >
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => void runScan()}
            loading={scanning}
          >
            Chạy scan 7 ngày
          </Button>
        </Space>
      </div>
      {error && <Alert type="error" showIcon title={error} className="mb-6" />}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <Statistic title="Tổng cảnh báo" value={summary?.total ?? "—"} />
        </Card>
        <Card>
          <Statistic
            title="Critical"
            value={summary?.critical ?? "—"}
            valueStyle={{ color: "#cf1322" }}
          />
        </Card>
        <Card>
          <Statistic
            title="High"
            value={summary?.high ?? "—"}
            valueStyle={{ color: "#d4380d" }}
          />
        </Card>
        <Card>
          <Statistic
            title="Medium"
            value={summary?.medium ?? "—"}
            valueStyle={{ color: "#d48806" }}
          />
        </Card>
        <Card>
          <Statistic
            title="Low"
            value={summary?.low ?? "—"}
            valueStyle={{ color: "#1677ff" }}
          />
        </Card>
      </div>
      <Card
        title={
          <Space>
            <WarningOutlined />Danh sách cảnh báo AI
          </Space>
        }
        extra={
          <Space wrap>
            <Select
              allowClear
              placeholder="Lọc mức độ"
              value={severity}
              onChange={setSeverity}
              options={["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((item) => ({
                value: item,
                label: item,
              }))}
            />
            <Select
              value={resolved ? "resolved" : "open"}
              onChange={(value) => setResolved(value === "resolved")}
              options={[
                { value: "open", label: "Đang mở" },
                { value: "resolved", label: "Đã xử lý" },
              ]}
            />
          </Space>
        }
      >
        <Table<AlertItem>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={data?.items || []}
          scroll={{ x: 800 }}
          locale={{ emptyText: <Empty description="Chưa có cảnh báo phù hợp" /> }}
          pagination={{ pageSize: 20, showSizeChanger: false }}
        />
      </Card>
      <Drawer
        title="Chi tiết cảnh báo"
        width={Math.min(
          680,
          typeof window === "undefined" ? 680 : window.innerWidth - 24,
        )}
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setNote("");
        }}
        extra={
          selected && (
            <Tag color={severityColor[selected.severity] || "default"}>
              {selected.severity} · {selected.riskScore}/100
            </Tag>
          )
        }
      >
        {selected && (
          <Space direction="vertical" size="large" className="w-full">
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Tín hiệu">
                {typeLabels[selected.type] || selected.type}
              </Descriptions.Item>
              <Descriptions.Item label="Mã rule">
                {selected.ruleVersion}
              </Descriptions.Item>
              <Descriptions.Item label="Sinh viên">
                {selected.diploma?.graduation?.student?.fullName || "Không rõ"}
              </Descriptions.Item>
              <Descriptions.Item label="MSSV nội bộ">
                {selected.diploma?.graduation?.student?.studentCode || "Không rõ"}
              </Descriptions.Item>
              <Descriptions.Item label="Số hiệu">
                {selected.diploma?.certificateNo || "Không rõ"}
              </Descriptions.Item>
              <Descriptions.Item label="Phát hiện lần đầu">
                {formatTime(selected.createdAt)}
              </Descriptions.Item>
              <Descriptions.Item label="Lần cuối thấy">
                {formatTime(selected.lastSeenAt)}
              </Descriptions.Item>
            </Descriptions>
            <Card size="small" title="Bằng chứng dữ liệu">
              <pre className="whitespace-pre-wrap break-words text-xs">
                {JSON.stringify(selected.evidence || {}, null, 2)}
              </pre>
            </Card>
            <Input.TextArea
              rows={3}
              maxLength={1000}
              showCount
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ghi chú kiểm tra, không nhập thông tin bí mật"
            />
            <Space>
              {!selected.resolvedAt ? (
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => void updateStatus(selected, "resolve")}
                >
                  Xác nhận đã xử lý
                </Button>
              ) : (
                <Button onClick={() => void updateStatus(selected, "reopen")}>
                  Mở lại cảnh báo
                </Button>
              )}
              <Link
                href={`/certificates?search=${encodeURIComponent(
                  selected.diploma?.certificateNo || selected.diplomaId,
                )}`}
              >
                <Button>Tra sổ văn bằng</Button>
              </Link>
            </Space>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
