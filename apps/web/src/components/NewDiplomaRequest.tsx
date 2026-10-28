"use client";

import { useEffect, useState } from "react";
import { Alert, Form, Input, InputNumber, Modal, Select, message } from "antd";
import { workflowJson } from "@/lib/diploma-workflow";
import { degreeOptions } from "./DiplomaPrintDataEditor";

type Program = { id: string; name: string; nameEn: string | null };
type Student = { studentId: string; name: string; dob?: string | null };

export default function NewDiplomaRequest({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [busy, setBusy] = useState(false);
  async function findStudents(search: string) {
    try {
      const result = await workflowJson<{ data: Student[] }>(
        "/api/students?limit=20&search=" + encodeURIComponent(search),
      );
      setStudents(result.data);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không tải được sinh viên",
      );
    }
  }
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      issuePlace: "TP. Hồ Chí Minh",
      diplomaSignerTitle: "HIỆU TRƯỞNG",
    });
    workflowJson<Program[]>("/api/imports/programs")
      .then(setPrograms)
      .catch((error: Error) => message.error(error.message));
    void findStudents("");
  }, [open, form]);
  async function submit() {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setBusy(true);
    try {
      await workflowJson("/api/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, gpa: values.gpa ?? null }),
      });
      message.success(
        "Đã lưu hồ sơ cấp mới. Cán bộ có thể duyệt và ký phát hành tại mục Hồ sơ chờ xử lý.",
      );
      onSaved();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Chưa gửi được yêu cầu",
      );
    } finally {
      setBusy(false);
    }
  }
  const required = [
    { required: true, message: "Thông tin bắt buộc cho cấp mới" },
  ];
  return (
    <Modal
      open={open}
      title="Lập yêu cầu cấp văn bằng mới"
      width={970}
      onCancel={() => {
        if (!busy) onClose();
      }}
      onOk={submit}
      okText="Lưu hồ sơ"
      confirmLoading={busy}
      cancelText="Hủy"
      maskClosable={!busy}
      cancelButtonProps={{ disabled: busy }}
    >
      <Alert
        type="info"
        showIcon
        className="mb-4"
        title="Hồ sơ đề nghị cấp văn bằng"
        description="Phải có sinh viên thuộc cơ sở, loại bằng, ngày cấp và người ký bằng đã được xác nhận. Không lấy ngày quyết định làm ngày cấp. Cán bộ cơ sở chính trực tiếp đối chiếu, duyệt và ký phát hành."
      />
      <Form form={form} layout="vertical" disabled={busy}>
        <div className="grid gap-x-4 md:grid-cols-3">
          <Form.Item
            name="mssv"
            label="Sinh viên đã có trong trường"
            rules={required}
          >
            <Select
              showSearch
              filterOption={false}
              onSearch={findStudents}
              placeholder="Tìm MSSV hoặc họ tên"
              options={students.map((student) => ({
                value: student.studentId,
                label: student.studentId + " - " + student.name,
              }))}
              onChange={(value) => {
                const student = students.find(
                  (student) => student.studentId === value,
                );
                form.setFieldsValue({
                  fullName: student?.name,
                  dob: student?.dob || undefined,
                });
              }}
            />
          </Form.Item>
          <Form.Item
            name="fullName"
            label="Họ và tên đúng hồ sơ sinh viên"
            rules={required}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item name="dob" label="Ngày sinh" rules={required}>
            <Input type="date" max={new Date().toISOString().slice(0, 10)} />
          </Form.Item>
          <Form.Item name="degreeType" label="Loại bằng" rules={required}>
            <Select options={degreeOptions} />
          </Form.Item>
          <Form.Item name="major" label="Ngành đào tạo" rules={required}>
            <Select
              showSearch
              optionFilterProp="label"
              options={programs.map((program) => ({
                value: program.name,
                label: program.name,
              }))}
              onChange={(value) =>
                form.setFieldValue(
                  "majorNameEn",
                  programs.find((program) => program.name === value)?.nameEn ||
                    undefined,
                )
              }
            />
          </Form.Item>
          <Form.Item
            name="majorNameEn"
            label="Tên ngành tiếng Anh trên bằng"
            rules={required}
          >
            <Input maxLength={255} />
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
          <Form.Item name="className" label="Lớp (hồ sơ nội bộ)">
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="soHieu" label="Số hiệu văn bằng" rules={required}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item
            name="soVaoSo"
            label="Số vào sổ gốc cấp văn bằng"
            rules={required}
          >
            <Input maxLength={180} />
          </Form.Item>
          <Form.Item
            name="issueDate"
            label="Ngày cấp trên bằng"
            rules={required}
          >
            <Input type="date" max={new Date().toISOString().slice(0, 10)} />
          </Form.Item>
          <Form.Item name="issuePlace" label="Nơi cấp" rules={required}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item
            name="diplomaSignerTitle"
            label="Chức danh người ký bằng"
            rules={required}
          >
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item
            name="diplomaSignerName"
            label="Họ tên, học hàm/học vị người ký bằng"
            rules={required}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item name="fullNameLatin" label="Họ tên trang tiếng Anh">
            <Input maxLength={255} placeholder="Bỏ trống: dùng họ tên bỏ dấu" />
          </Form.Item>
          <Form.Item
            name="gpa"
            label="GPA hệ 4 (không bắt buộc, không in mặt bằng)"
          >
            <InputNumber className="w-full" min={0} max={4} step={0.01} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
