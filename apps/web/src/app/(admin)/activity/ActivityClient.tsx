"use client";

import PageTitle from "@/components/PageTitle";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
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
  Typography,
} from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { workflowJson } from "@/lib/diploma-workflow";
import {
  activityLabels,
  activitySearchParams,
  type ActivityEntry,
  type ActivityFilters,
} from "@/lib/activity";

const emptyFilters: ActivityFilters = {
  search: "",
  action: "",
  result: "",
  from: "",
  to: "",
};
const timeLabel = (value: string) =>
  new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

const metadataLabels: Record<string, string> = {
  actorId: "Mã tài khoản",
  after: "Thông tin sau thay đổi",
  anchorId: "Mã neo blockchain",
  basis: "Căn cứ xử lý",
  before: "Thông tin trước thay đổi",
  batchId: "Mã đợt",
  code: "Mã nghiệp vụ",
  corrections: "Nội dung điều chỉnh",
  count: "Số lượng",
  diplomaId: "Mã văn bằng",
  diplomaIds: "Danh sách mã văn bằng",
  emailSent: "Đã gửi email",
  expiresAt: "Thời hạn liên kết",
  note: "Ghi chú xử lý",
  previousAttempts: "Số lần thử trước",
  previousError: "Lỗi lần thử trước",
  previousIssuedOn: "Ngày cấp trước đó",
  programId: "Mã ngành đào tạo",
  reason: "Lý do",
  recipientEmail: "Email người nhận",
  recheckedRowIds: "Các dòng đã kiểm tra lại",
  replacementId: "Mã hồ sơ thay thế",
  sourceHash: "Mã băm nguồn",
  sourceId: "Mã nguồn",
  sourceRowId: "Mã dòng dữ liệu nguồn",
  status: "Trạng thái",
  transactionId: "Mã giao dịch",
};

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
    if (value.length === 0) {
      return <Typography.Text type="secondary">Không có dữ liệu</Typography.Text>;
    }
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
    if (entries.length === 0) {
      return <Typography.Text type="secondary">Không có dữ liệu</Typography.Text>;
    }
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

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = activitySearchParams(
      filters,
      pagination.page,
      pagination.limit,
    );
    workflowJson<ActivityPage>("/api/activity?" + params, {
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

  function applyFilters(values: ActivityFilters) {
    const next = { ...emptyFilters, ...values };
    if (next.from && next.to && next.from > next.to) {
      setError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
      return;
    }
    setFilters(next);
    setPagination((previous) => ({ ...previous, page: 1 }));
  }

  return (
    <div className="workspace-page">
      <PageTitle>Nhật ký hoạt động</PageTitle>
      <Typography.Paragraph type="secondary">
        Tra cứu người thực hiện, thời điểm và kết quả xử lý trong phạm vi nhà
        trường. Nhật ký chỉ được xem, không chỉnh sửa hoặc xóa.
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        initialValues={emptyFilters}
        onFinish={applyFilters}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-x-4">
          <Form.Item name="search" label="Người thực hiện / đối tượng">
            <Input
              allowClear
              maxLength={255}
              placeholder="Email hoặc mã hồ sơ"
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
            loading={loading}
          >
            Tải lại
          </Button>
        </Space>
      </Form>
      {error && <Alert showIcon type="error" title={error} className="mb-4" />}
      <Table<ActivityEntry>
        rowKey="id"
        dataSource={data}
        loading={loading}
        scroll={{ x: 1050 }}
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
            dataIndex: "target",
            ellipsis: true,
            render: (value: string | null) => value || "—",
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
        width={760}
      >
        {selected && (
          <>
            <Descriptions
              bordered
              column={1}
              size="small"
              items={[
                {
                  key: "id",
                  label: "Mã nhật ký",
                  children: (
                    <Typography.Text copyable={{ text: selected.id }}>
                      {selected.id}
                    </Typography.Text>
                  ),
                },
                {
                  key: "time",
                  label: "Thời điểm",
                  children: timeLabel(selected.createdAt),
                },
                {
                  key: "actor",
                  label: "Người thực hiện",
                  children: selected.actorEmail,
                },
                {
                  key: "action",
                  label: "Hoạt động",
                  children: activityLabels[selected.action] || selected.action,
                },
                {
                  key: "target",
                  label: "Đối tượng",
                  children: selected.target || "Không có dữ liệu",
                },
                {
                  key: "result",
                  label: "Kết quả",
                  children: (
                    <Tag color={selected.result === "SUCCESS" ? "green" : "red"}>
                      {selected.result === "SUCCESS" ? "Thành công" : "Thất bại"}
                    </Tag>
                  ),
                },
                {
                  key: "actorId",
                  label: "Mã tài khoản",
                  children: selected.actorId || "Không có dữ liệu",
                },
                {
                  key: "institutionId",
                  label: "Mã đơn vị",
                  children: selected.institutionId || "Không có dữ liệu",
                },
                {
                  key: "ip",
                  label: "Địa chỉ IP",
                  children: selected.ip || "Không có dữ liệu",
                },
                {
                  key: "userAgent",
                  label: "Thiết bị / trình duyệt",
                  children: selected.userAgent || "Không có dữ liệu",
                },
              ]}
            />
            {selected.errorMessage && (
              <Alert
                type="error"
                title={selected.errorMessage}
                className="mt-4"
              />
            )}
            {selected.metadata && (
              <>
                <Typography.Title level={5}>
                  Thông tin ghi nhận
                </Typography.Title>
                <MetadataValue fieldKey="metadata" value={selected.metadata} />
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
