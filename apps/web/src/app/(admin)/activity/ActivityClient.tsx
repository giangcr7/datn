"use client";

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
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <Typography.Title level={2}>Nhật ký hoạt động</Typography.Title>
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
                  children: selected.target || "—",
                },
                {
                  key: "result",
                  label: "Kết quả",
                  children:
                    selected.result === "SUCCESS" ? "Thành công" : "Thất bại",
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
                <pre className="bg-gray-50 p-4 rounded text-xs whitespace-pre-wrap break-words max-h-96 overflow-auto">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
