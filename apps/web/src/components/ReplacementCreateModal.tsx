"use client";
import { Alert, Form, Input, Modal, Typography, message } from "antd";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { workflowJson } from "@/lib/diploma-workflow";

export default function ReplacementCreateModal({
  source,
  onClose,
}: {
  source: {
    uuid: string;
    fullName: string;
    mssv: string;
    soHieu: string;
    soVaoSo: string;
    updatedAt: string;
  };
  onClose: () => void;
}) {
  const [form] = Form.useForm<{
    note: string;
    basis: string;
    soHieu: string;
    soVaoSo: string;
    issueDate: string;
  }>();
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function create() {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setBusy(true);
    try {
      await workflowJson("/api/cert/replacements/" + source.uuid + "/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          expectedUpdatedAt: source.updatedAt,
        }),
      });
      message.success(
        "Đã lập hồ sơ thay thế. Văn bằng cũ vẫn còn hiệu lực cho đến khi duyệt thay thế.",
      );
      onClose();
      router.push("/pending?view=replacements");
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : "Không lập được hồ sơ thay thế",
      );
    } finally {
      setBusy(false);
    }
  }
  const required = [
    {
      required: true,
      whitespace: true,
      message: "Vui lòng nhập thông tin này",
    },
  ];
  return (
    <Modal
      open
      title="Lập hồ sơ sửa sai và thay thế"
      onCancel={() => {
        if (!busy) onClose();
      }}
      onOk={() => void create()}
      confirmLoading={busy}
      okText="Lập hồ sơ thay thế"
      cancelText="Đóng"
      maskClosable={!busy}
      cancelButtonProps={{ disabled: busy }}
    >
      <Typography.Paragraph>
        <strong>{source.fullName}</strong> · {source.mssv}
        <br />
        Văn bằng gốc: {source.soHieu} · Sổ: {source.soVaoSo}
      </Typography.Paragraph>
      <Alert
        className="mb-4"
        type="info"
        showIcon
        title="Không sửa hoặc ghi đè bản đã phát hành"
        description="Hệ thống tạo hồ sơ riêng để đối chiếu, sửa sai và trình duyệt. Khi duyệt, bản cũ ngừng hiệu lực; bản mới chỉ sử dụng được sau khi blockchain xác nhận."
      />
      <Form form={form} layout="vertical" disabled={busy}>
        <Form.Item
          name="note"
          label="Lý do sửa sai / thay thế"
          rules={required}
        >
          <Input.TextArea maxLength={2000} rows={3} showCount />
        </Form.Item>
        <Form.Item
          name="basis"
          label="Căn cứ thay thế (số, ngày quyết định / biên bản)"
          rules={required}
        >
          <Input.TextArea maxLength={2000} rows={2} />
        </Form.Item>
        <Form.Item name="soHieu" label="Số hiệu văn bằng mới" rules={required}>
          <Input maxLength={120} />
        </Form.Item>
        <Form.Item name="soVaoSo" label="Số vào sổ mới" rules={required}>
          <Input maxLength={180} />
        </Form.Item>
        <Form.Item
          name="issueDate"
          label="Ngày cấp trên văn bằng thay thế"
          rules={required}
        >
          <Input type="date" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
