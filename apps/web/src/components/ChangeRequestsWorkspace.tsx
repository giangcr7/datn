"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
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
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import PageTitle from "./PageTitle";
import {
  changeFieldLabels,
  requestStatusLabels,
  workdeskFetch,
  type DiplomaChangeRequest,
} from "@/lib/change-requests";

interface EligibleDiploma {
  id: string;
  certificateNo: string;
  registryNo: string;
  current: Record<string, unknown>;
  activeRequestId: string | null;
}
const colors: Record<string, string> = {
  PENDING: "gold",
  IN_REVIEW: "blue",
  NEEDS_INFORMATION: "orange",
  RESOLVED: "green",
  REJECTED: "red",
};
const date = (value: string) => new Date(value).toLocaleString("vi-VN");

export default function ChangeRequestsWorkspace({
  student,
  initialStatus,
}: {
  student: boolean;
  initialStatus?: string;
}) {
  const [records, setRecords] = useState<DiplomaChangeRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string | undefined>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<DiplomaChangeRequest | null>(null);
  const [creating, setCreating] = useState(false);
  const [eligible, setEligible] = useState<EligibleDiploma[]>([]);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<string>();
  const [createForm] = Form.useForm();
  const [actionForm] = Form.useForm();
  const diplomaId = Form.useWatch("diplomaId", createForm) as
    | string
    | undefined;
  const fields = (Form.useWatch("fields", createForm) || []) as string[];
  const diploma = eligible.find((item) => item.id === diplomaId);
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const result = await workdeskFetch<{
        data: DiplomaChangeRequest[];
        total: number;
      }>(
        "/api/change-requests?page=" +
          page +
          "&limit=10" +
          (status ? "&status=" + status : ""),
      );
      if (sequence.current !== current) return;
      setRecords(result.data);
      setTotal(result.total);
      setError("");
      setSelected((previous) =>
        previous
          ? result.data.find((item) => item.id === previous.id) || previous
          : null,
      );
    } catch (failure) {
      if (sequence.current === current) setError((failure as Error).message);
    } finally {
      if (sequence.current === current) setLoading(false);
    }
  }, [page, status]);
  const invalidate = useCallback(() => {
    sequence.current += 1;
  }, []);
  useEffect(() => {
    void reload();
    return invalidate;
  }, [reload, invalidate]);

  async function openCreate() {
    setLoading(true);
    try {
      const result = await workdeskFetch<{ data: EligibleDiploma[] }>(
        "/api/change-requests/eligible",
      );
      setEligible(result.data);
      createForm.resetFields();
      setCreating(true);
    } catch (failure) {
      message.error((failure as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function createRequest() {
    const values = await createForm.validateFields();
    setSaving(true);
    try {
      await workdeskFetch("/api/change-requests", {
        diplomaId: values.diplomaId,
        reason: values.reason,
        changes: values.fields.map((field: string) => ({
          field,
          value: values[field],
        })),
      });
      setCreating(false);
      message.success("Đã gửi yêu cầu đến nhà trường");
      await reload();
    } catch (failure) {
      message.error((failure as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function applyAction() {
    if (!selected || !action) return;
    const values = await actionForm.validateFields();
    setSaving(true);
    try {
      const updated = await workdeskFetch<DiplomaChangeRequest>(
        "/api/change-requests/" + selected.id + "/action",
        {
          status: action,
          expectedRevision: selected.revision,
          note: values.note,
          ...(action === "RESOLVED"
            ? { resolvedDiplomaId: selected.replacement?.id }
            : {}),
        },
      );
      setSelected(updated);
      setAction(undefined);
      message.success("Đã cập nhật yêu cầu");
      await reload();
    } catch (failure) {
      message.error((failure as Error).message);
      await reload();
    } finally {
      setSaving(false);
    }
  }
  const actions = !selected
    ? []
    : student
      ? selected.status === "NEEDS_INFORMATION"
        ? ["PENDING", "CANCELLED"]
        : selected.status === "PENDING"
          ? ["CANCELLED"]
          : []
      : selected.status === "PENDING"
        ? ["IN_REVIEW", "REJECTED"]
        : selected.status === "IN_REVIEW"
          ? ["NEEDS_INFORMATION", "RESOLVED", "REJECTED"]
          : selected.status === "NEEDS_INFORMATION"
            ? ["REJECTED"]
            : [];
  const actionLabels: Record<string, string> = {
    IN_REVIEW: "Tiếp nhận xử lý",
    NEEDS_INFORMATION: "Yêu cầu bổ sung",
    RESOLVED: "Hoàn tất bằng văn bằng thay thế",
    REJECTED: "Không chấp nhận",
    CANCELLED: "Rút yêu cầu",
    PENDING: "Gửi thông tin bổ sung",
  };

  return (
    <div className="workspace-page">
      <PageTitle>
        {student ? "Yêu cầu chỉnh sửa của tôi" : "Yêu cầu chỉnh sửa văn bằng"}
      </PageTitle>
      <Typography.Paragraph type="secondary">
        {student
          ? "Gửi đề nghị khi thông tin trên văn bằng chưa chính xác và theo dõi phản hồi của nhà trường."
          : "Tiếp nhận đề nghị của sinh viên, đối chiếu căn cứ và xử lý qua hồ sơ thay thế."}
      </Typography.Paragraph>
      <Card>
        <Space wrap style={{ marginBottom: 20 }}>
          <Select
            aria-label="Lọc trạng thái yêu cầu"
            placeholder="Tất cả trạng thái"
            allowClear
            value={status}
            style={{ width: 220 }}
            options={Object.entries(requestStatusLabels).map(
              ([value, label]) => ({ value, label }),
            )}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <Button
            icon={<ReloadOutlined aria-hidden="true" />}
            onClick={() => void reload()}
            loading={loading}
          >
            Tải lại
          </Button>
          {student && (
            <Button
              type="primary"
              icon={<PlusOutlined aria-hidden="true" />}
              onClick={() => void openCreate()}
              disabled={loading}
            >
              Gửi yêu cầu
            </Button>
          )}
        </Space>
        {error && (
          <Alert
            type="error"
            showIcon
            title={error}
            style={{ marginBottom: 16 }}
          />
        )}
        <Table<DiplomaChangeRequest>
          rowKey="id"
          loading={loading}
          dataSource={records}
          scroll={{ x: 780 }}
          pagination={{
            current: page,
            total,
            pageSize: 10,
            showSizeChanger: false,
            onChange: setPage,
          }}
          columns={[
            ...(!student
              ? [
                  {
                    title: "Sinh viên",
                    key: "student",
                    render: (_: unknown, record: DiplomaChangeRequest) => (
                      <>
                        <strong>{record.studentName}</strong>
                        <br />
                        {record.studentCode}
                      </>
                    ),
                  },
                ]
              : []),
            {
              title: "Văn bằng",
              dataIndex: "certificateNo",
              render: (value, record) => (
                <>
                  {value}
                  <br />
                  <Typography.Text type="secondary">
                    {record.registryNo}
                  </Typography.Text>
                </>
              ),
            },
            {
              title: "Nội dung",
              key: "changes",
              render: (_, record) =>
                record.changes
                  .map((change) => changeFieldLabels[change.field])
                  .join(", "),
            },
            {
              title: "Trạng thái",
              dataIndex: "status",
              render: (value) => (
                <Tag color={colors[value]}>{requestStatusLabels[value]}</Tag>
              ),
            },
            { title: "Cập nhật", dataIndex: "updatedAt", render: date },
            {
              title: "Thao tác",
              key: "action",
              render: (_, record) => (
                <Button onClick={() => setSelected(record)}>Chi tiết</Button>
              ),
            },
          ]}
        />
      </Card>
      <Drawer
        title="Chi tiết yêu cầu chỉnh sửa"
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setAction(undefined);
        }}
        width={680}
      >
        {selected && (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Descriptions
              column={1}
              items={[
                {
                  key: "student",
                  label: "Sinh viên",
                  children: selected.studentName + " · " + selected.studentCode,
                },
                {
                  key: "cert",
                  label: "Số hiệu",
                  children: selected.certificateNo,
                },
                {
                  key: "status",
                  label: "Trạng thái",
                  children: (
                    <Tag color={colors[selected.status]}>
                      {requestStatusLabels[selected.status]}
                    </Tag>
                  ),
                },
                {
                  key: "reason",
                  label: "Lý do và căn cứ",
                  children: (
                    <span
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {selected.reason}
                    </span>
                  ),
                },
              ]}
            />
            <Table
              rowKey="field"
              size="small"
              pagination={false}
              dataSource={selected.changes}
              scroll={{ x: 470 }}
              columns={[
                {
                  title: "Thông tin",
                  dataIndex: "field",
                  render: (value) => changeFieldLabels[value],
                },
                {
                  title: "Trên văn bằng đã cấp",
                  dataIndex: "before",
                  render: (value) => value || "Chưa ghi nhận",
                },
                { title: "Đề nghị chỉnh sửa", dataIndex: "after" },
              ]}
            />
            {!student && (
              <Space wrap>
                <Link
                  href={
                    "/certificates?search=" +
                    encodeURIComponent(selected.certificateNo)
                  }
                >
                  <Button>Mở sổ văn bằng</Button>
                </Link>
                <Link href="/pending?view=replacements">
                  <Button>Hồ sơ thay thế</Button>
                </Link>
              </Space>
            )}
            {selected.resolvedDiplomaId && (
              <Alert
                type="success"
                showIcon
                title="Đã phát hành văn bằng thay thế"
                description={
                  selected.replacement?.certificateNo ||
                  "Văn bằng thay thế đã được xác nhận."
                }
              />
            )}
            <Space wrap>
              {actions.map((next) => (
                <Button
                  key={next}
                  type={
                    next === "IN_REVIEW" || next === "PENDING"
                      ? "primary"
                      : "default"
                  }
                  danger={["REJECTED", "CANCELLED"].includes(next)}
                  disabled={next === "RESOLVED" && !selected.replacement}
                  onClick={() => {
                    actionForm.resetFields();
                    setAction(next);
                  }}
                >
                  {actionLabels[next]}
                </Button>
              ))}
            </Space>
            <Typography.Title level={5}>Lịch sử xử lý</Typography.Title>
            <Timeline
              items={selected.events.map((event) => ({
                color: colors[event.status] || "gray",
                children: (
                  <div>
                    <strong>
                      {requestStatusLabels[event.status]} · {event.actorLabel}
                    </strong>
                    <div>{date(event.createdAt)}</div>
                    <Typography.Paragraph
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {event.note}
                    </Typography.Paragraph>
                  </div>
                ),
              }))}
            />
          </Space>
        )}
      </Drawer>
      <Modal
        title="Gửi yêu cầu chỉnh sửa"
        open={creating}
        onCancel={() => {
          if (!saving) setCreating(false);
        }}
        onOk={() => void createRequest().catch(() => undefined)}
        confirmLoading={saving}
        okText="Gửi yêu cầu"
        okButtonProps={{
          disabled: eligible.every((item) => !!item.activeRequestId),
        }}
        cancelText="Hủy"
        width={620}
      >
        <Alert
          type="info"
          showIcon
          title="Nhà trường sẽ đối chiếu căn cứ trước khi xử lý. Yêu cầu này không tự thay đổi văn bằng đã cấp."
          style={{ marginBottom: 20 }}
        />
        {eligible.length === 0 ? (
          <Empty description="Chưa có văn bằng còn hiệu lực để gửi yêu cầu" />
        ) : (
          <Form form={createForm} layout="vertical">
            <Form.Item
              name="diplomaId"
              label="Văn bằng"
              rules={[{ required: true, message: "Chọn văn bằng" }]}
            >
              <Select
                options={eligible.map((item) => ({
                  value: item.id,
                  label:
                    item.certificateNo +
                    " · " +
                    item.registryNo +
                    (item.activeRequestId ? " (Đang có yêu cầu)" : ""),
                  disabled: !!item.activeRequestId,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="fields"
              label="Thông tin cần chỉnh sửa"
              rules={[
                { required: true, message: "Chọn ít nhất một thông tin" },
              ]}
            >
              <Select
                mode="multiple"
                options={Object.entries(changeFieldLabels).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
            </Form.Item>
            {fields.map((field) => (
              <Form.Item
                key={field}
                name={field}
                label={changeFieldLabels[field] + " đề nghị"}
                extra={
                  "Đang ghi nhận: " +
                  String(diploma?.current[field] || "Chưa ghi nhận")
                }
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    max: 255,
                    message: "Nhập thông tin đề nghị (tối đa 255 ký tự)",
                  },
                ]}
              >
                <Input
                  placeholder={field === "dob" ? "YYYY-MM-DD" : ""}
                  maxLength={255}
                />
              </Form.Item>
            ))}
            <Form.Item
              name="reason"
              label="Lý do và căn cứ đối chiếu"
              rules={[
                {
                  required: true,
                  min: 10,
                  max: 2000,
                  whitespace: true,
                  message: "Nhập từ 10 đến 2.000 ký tự",
                },
              ]}
            >
              <Input.TextArea rows={4} maxLength={2000} showCount />
            </Form.Item>
          </Form>
        )}
      </Modal>
      <Modal
        title={action ? actionLabels[action] : ""}
        open={!!action}
        onCancel={() => {
          if (!saving) setAction(undefined);
        }}
        onOk={() => void applyAction().catch(() => undefined)}
        confirmLoading={saving}
        okText="Xác nhận"
        cancelText="Hủy"
      >
        {action === "RESOLVED" && (
          <Alert
            type="info"
            title={
              "Liên kết văn bằng thay thế: " +
              (selected?.replacement?.certificateNo || "")
            }
            description="Chỉ hoàn tất khi văn bằng thay thế đã được blockchain xác nhận."
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={actionForm} layout="vertical">
          <Form.Item
            name="note"
            label={
              student ? "Nội dung gửi nhà trường" : "Ý kiến xử lý và căn cứ"
            }
            rules={[
              {
                required: true,
                min: 5,
                max: 2000,
                whitespace: true,
                message: "Nhập từ 5 đến 2.000 ký tự",
              },
            ]}
          >
            <Input.TextArea rows={4} maxLength={2000} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
