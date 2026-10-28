"use client";

import { useEffect, useState } from "react";
import { Alert, Form, Input, InputNumber, Modal, Select, message } from "antd";
import { degreeOptions } from "@/components/DiplomaPrintDataEditor";
import { workflowJson } from "@/lib/diploma-workflow";
import {
  correctionValues,
  type CorrectionDiploma,
} from "@/lib/diploma-corrections";

type Program = { id: string; name: string; nameEn: string | null };
const required = [
  { required: true, message: "Vui lòng bổ sung thông tin này" },
];

export default function CorrectionEditor({
  record,
  onClose,
  onSaved,
  replacement = false,
}: {
  record: CorrectionDiploma;
  onClose: () => void;
  onSaved: () => void;
  replacement?: boolean;
}) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let active = true;
    form.setFieldsValue(correctionValues(record));
    workflowJson<Program[]>("/api/imports/programs")
      .then((result) => {
        if (active) setPrograms(result);
      })
      .catch((error) => {
        if (active)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Không tải được ngành đào tạo",
          );
      });
    return () => {
      active = false;
    };
  }, [record, form]);

  async function save() {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setBusy(true);
    try {
      await workflowJson(
        "/api/cert/" +
          (replacement ? "replacements/" : "corrections/") +
          record.uuid,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...values,
            gpa: values.gpa ?? null,
            className: values.className || null,
            fullNameLatin: values.fullNameLatin || null,
            expectedUpdatedAt: record.updatedAt,
          }),
        },
      );
      message.success(
        "Đã lưu thông tin và lịch sử đối soát. Hồ sơ chưa được trình duyệt hoặc phát hành.",
      );
      onSaved();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không lưu được hồ sơ",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={
        (replacement ? "Sửa sai hồ sơ thay thế · " : "Bổ sung hồ sơ · ") +
        record.mssv
      }
      width={980}
      onCancel={() => {
        if (!busy) onClose();
      }}
      onOk={() => void save()}
      okText="Lưu bổ sung"
      cancelText="Đóng"
      confirmLoading={busy}
      okButtonProps={{ disabled: !programs || !!loadError }}
      cancelButtonProps={{ disabled: busy }}
      maskClosable={!busy}
    >
      <Alert
        className="mb-4"
        type="info"
        showIcon
        title={
          replacement
            ? "Thông tin văn bằng thay thế"
            : "Lý do từ chối: " + (record.rejection?.reason || "Chưa ghi nhận")
        }
        description={
          replacement
            ? "Sửa thông tin riêng của văn bằng thay thế; không thay đổi văn bằng cũ, hồ sơ sinh viên hoặc tệp nguồn. MSSV và quyết định tốt nghiệp giữ nguyên. Mỗi lần lưu cần ghi nội dung sửa sai."
            : "MSSV và quyết định tốt nghiệp được giữ nguyên. Họ tên/ngày sinh chỉ được sửa khi không dùng chung với hồ sơ khác. Mỗi lần lưu phải có căn cứ đối soát; tệp nguồn gốc không bị ghi đè."
        }
      />
      {loadError && (
        <Alert type="error" showIcon title={loadError} className="mb-4" />
      )}
      <Form
        form={form}
        layout="vertical"
        disabled={busy}
        onValuesChange={(changed: { fullName?: string }) => {
          if (replacement && changed.fullName !== undefined)
            form.setFieldValue("fullNameLatin", "");
        }}
      >
        <div className="grid gap-x-4 md:grid-cols-3">
          <Form.Item name="fullName" label="Họ và tên" rules={required}>
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item name="dob" label="Ngày sinh" rules={required}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="programId" label="Ngành đào tạo" rules={required}>
            <Select
              loading={!programs}
              showSearch
              optionFilterProp="label"
              options={programs?.map((program) => ({
                value: program.id,
                label: program.name,
              }))}
              onChange={(value) =>
                form.setFieldValue(
                  "majorNameEn",
                  programs?.find((program) => program.id === value)?.nameEn ||
                    "",
                )
              }
            />
          </Form.Item>
          <Form.Item name="degreeType" label="Loại bằng" rules={required}>
            <Select options={degreeOptions} />
          </Form.Item>
          <Form.Item name="grade" label="Hạng tốt nghiệp" rules={required}>
            <Select
              options={[
                "Xuất sắc",
                "Giỏi",
                "Khá",
                "Trung bình khá",
                "Trung bình",
              ].map((value) => ({ value, label: value }))}
            />
          </Form.Item>
          <Form.Item
            name="namTotNghiep"
            label="Năm tốt nghiệp"
            rules={required}
          >
            <InputNumber
              className="w-full"
              min={1900}
              max={new Date().getFullYear()}
            />
          </Form.Item>
          <Form.Item name="className" label="Lớp">
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="gpa"
            label={"Điểm trung bình (hệ " + record.gpaScale + ")"}
          >
            <InputNumber
              className="w-full"
              min={0}
              max={record.gpaScale}
              step={0.01}
            />
          </Form.Item>
          <Form.Item name="soHieu" label="Số hiệu văn bằng" rules={required}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="soVaoSo" label="Số vào sổ" rules={required}>
            <Input maxLength={180} />
          </Form.Item>
          <Form.Item
            name="issueDate"
            label="Ngày cấp trên bằng"
            rules={required}
          >
            <Input type="date" />
          </Form.Item>
          <Form.Item name="issuePlace" label="Nơi cấp" rules={required}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="fullNameLatin" label="Họ tên trang tiếng Anh">
            <Input
              maxLength={255}
              placeholder="Để trống để dùng họ tên không dấu"
            />
          </Form.Item>
          <Form.Item
            name="majorNameEn"
            label="Tên ngành tiếng Anh"
            rules={required}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item
            name="diplomaSignerName"
            label="Họ tên, học hàm/học vị người ký"
            rules={required}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item
            name="diplomaSignerTitle"
            label="Chức danh người ký"
            rules={required}
          >
            <Input maxLength={120} />
          </Form.Item>
        </div>
        <Form.Item
          name="note"
          label="Nội dung bổ sung / nguồn đối chiếu"
          rules={required}
        >
          <Input.TextArea rows={3} maxLength={2000} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
