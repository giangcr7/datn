"use client";

import { useEffect, useState } from "react";
import { Alert, Form, Input, Modal, Select, message } from "antd";
import { workflowJson, type WorkflowDiploma } from "@/lib/diploma-workflow";

export const degreeOptions = [
  { value: "BACHELOR", label: "Bằng cử nhân" },
  { value: "ENGINEER", label: "Bằng kỹ sư" },
  { value: "MASTER", label: "Bằng thạc sĩ" },
  { value: "DOCTOR", label: "Bằng tiến sĩ" },
  { value: "OTHER", label: "Loại khác" },
];

export default function DiplomaPrintDataEditor({
  records,
  onClose,
  onSaved,
}: {
  records: WorkflowDiploma[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const single = records.length === 1;
  useEffect(() => {
    form.resetFields();
    if (records.length === 1)
      form.setFieldsValue({
        ...records[0].printedDiploma,
        degreeType: records[0].degreeType || undefined,
        issueDate: records[0].issueDate || undefined,
      });
  }, [records, form]);
  async function save() {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const printData: Record<string, unknown> = { note: values.note };
    for (const field of [
      "degreeType",
      "issueDate",
      "fullNameLatin",
      "majorNameEn",
      "issuePlace",
      "diplomaSignerName",
      "diplomaSignerTitle",
    ])
      if (
        values[field] !== undefined &&
        (single || values[field] !== "") &&
        (field !== "issueDate" || values[field] !== "")
      )
        printData[field] = values[field] === "" ? null : values[field];
    if (Object.keys(printData).length === 1) {
      message.warning("Chọn ít nhất một thông tin cần bổ sung");
      return;
    }
    setBusy(true);
    try {
      let succeeded = 0;
      const errors: string[] = [];
      for (let offset = 0; offset < records.length; offset += 100) {
        const result = await workflowJson<{
          succeeded: number;
          results: { success: boolean; error?: string }[];
        }>("/api/cert/bulk/print-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            diplomaIds: records
              .slice(offset, offset + 100)
              .map((record) => record.uuid),
            printData,
          }),
        });
        succeeded += result.succeeded;
        errors.push(
          ...result.results
            .filter((result) => !result.success)
            .map((result) => result.error || "Không lưu được"),
        );
      }
      if (errors.length)
        message.warning(
          succeeded + "/" + records.length + " đã lưu. " + errors[0],
        );
      else
        message.success(
          "Đã lưu thông tin bằng và lịch sử đối soát; chưa ký và chưa phát hành",
        );
      onSaved();
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : "Không lưu được thông tin bằng",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={records.length > 0}
      title={
        single
          ? "Đối chiếu thông tin in bằng - " + records[0]?.fullName
          : "Bổ sung chung cho " + records.length + " văn bằng nháp"
      }
      width={780}
      onCancel={() => {
        if (!busy) onClose();
      }}
      onOk={save}
      okText="Lưu thông tin đã đối chiếu"
      cancelText="Hủy"
      confirmLoading={busy}
      maskClosable={!busy}
      cancelButtonProps={{ disabled: busy }}
    >
      <Alert
        type="info"
        showIcon
        className="mb-4"
        title="Thông tin đề nghị cấp văn bằng"
        description="Chỉ thay đổi hồ sơ nháp chưa ký. Ngày cấp và người ký bằng cần được nhà trường xác nhận."
      />
      {!single && (
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          title="Chỉ nhập các giá trị thực sự giống nhau cho toàn bộ hồ sơ đã chọn; bỏ trống để giữ nguyên."
        />
      )}
      <Form form={form} layout="vertical" disabled={busy}>
        <div className="grid gap-x-4 md:grid-cols-2">
          <Form.Item name="degreeType" label="Loại bằng">
            <Select
              allowClear
              options={degreeOptions}
              placeholder="Giữ nguyên / chưa xác nhận"
            />
          </Form.Item>
          <Form.Item name="issueDate" label="Ngày cấp đã xác nhận">
            <Input type="date" max={new Date().toISOString().slice(0, 10)} />
          </Form.Item>
          <Form.Item name="majorNameEn" label="Tên ngành tiếng Anh trên bằng">
            <Input
              maxLength={255}
              placeholder="Ví dụ: Information Technology"
            />
          </Form.Item>
          {single && (
            <Form.Item name="fullNameLatin" label="Họ tên ở trang tiếng Anh">
              <Input
                maxLength={255}
                placeholder="Để trống: họ tên bỏ dấu, không dịch tên"
              />
            </Form.Item>
          )}
          <Form.Item name="issuePlace" label="Nơi cấp trên bằng">
            <Input maxLength={120} placeholder="Ví dụ: TP. Hồ Chí Minh" />
          </Form.Item>
          <Form.Item
            name="diplomaSignerTitle"
            label="Chức danh người ký trên bằng"
          >
            <Input maxLength={120} placeholder="Ví dụ: HIỆU TRƯỞNG" />
          </Form.Item>
          <Form.Item
            name="diplomaSignerName"
            label="Họ tên, học hàm/học vị người ký trên bằng"
          >
            <Input maxLength={255} />
          </Form.Item>
        </div>
        <Form.Item
          name="note"
          label="Nguồn đối chiếu / lý do xác nhận"
          rules={[
            {
              required: true,
              whitespace: true,
              message: "Ghi rõ nguồn đối chiếu",
            },
          ]}
        >
          <Input.TextArea rows={3} maxLength={2000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
