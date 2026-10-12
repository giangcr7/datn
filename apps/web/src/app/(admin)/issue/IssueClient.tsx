"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Typography,
  message,
} from "antd";
import { useRouter } from "next/navigation";

export default function IssueClient() {
  const [loading, setLoading] = useState(false);
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/imports/programs")
      .then((response) => response.json())
      .then((result) => {
        if (!result.success)
          throw new Error(result.error || "Không tải được danh mục ngành");
        setPrograms(result.data);
      })
      .catch((error) => message.error(error.message));
  }, []);
  const router = useRouter();
  async function submit(values: any) {
    setLoading(true);
    try {
      const response = await fetch("/api/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          dob: values.dob.format("YYYY-MM-DD"),
          issueDate: values.issueDate.format("YYYY-MM-DD"),
          gpa: values.gpa ?? null,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(
          result.error || result.message || "Không lưu được yêu cầu",
        );
      message.success(
        "Đã lưu yêu cầu. Cần cán bộ khác phê duyệt trước khi neo blockchain.",
      );
      router.push("/pending");
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Typography.Title level={3}>Lập yêu cầu cấp văn bằng</Typography.Title>
      <Alert
        type="info"
        showIcon
        className="mb-5"
        message="PostgreSQL lưu hồ sơ; Fabric chỉ nhận hash sau phê duyệt."
        description="Không tự phê duyệt, không gán GPA hoặc ngày cấp nếu nguồn chưa xác nhận. Cơ sở được lấy từ tài khoản đăng nhập."
      />
      <Card>
        <Form layout="vertical" onFinish={submit}>
          <div className="grid md:grid-cols-2 gap-x-5">
            <Form.Item
              name="mssv"
              label="Mã sinh viên"
              rules={[
                {
                  required: true,
                  pattern: /^\d{10}$/,
                  message: "MSSV gồm 10 chữ số",
                },
              ]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="fullName"
              label="Họ và tên theo hồ sơ"
              rules={[{ required: true }]}
            >
              <Input maxLength={255} />
            </Form.Item>
            <Form.Item
              name="dob"
              label="Ngày sinh đã xác nhận"
              rules={[{ required: true }]}
            >
              <DatePicker format="DD/MM/YYYY" className="w-full" />
            </Form.Item>
            <Form.Item
              name="major"
              label="Ngành đào tạo"
              rules={[{ required: true }]}
            >
              <Select
                showSearch
                options={programs.map((program) => ({
                  value: program.name,
                  label: program.name,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="gpa"
              label="GPA hệ 4 (để trống nếu nguồn không có)"
            >
              <InputNumber min={0} max={4} step={0.01} className="w-full" />
            </Form.Item>
            <Form.Item
              name="grade"
              label="Xếp loại theo sổ gốc"
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  "Trung bình",
                  "Trung bình khá",
                  "Khá",
                  "Giỏi",
                  "Xuất sắc",
                ].map((value) => ({ value, label: value }))}
              />
            </Form.Item>
            <Form.Item
              name="soHieu"
              label="Số hiệu văn bằng"
              rules={[{ required: true }]}
            >
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item
              name="soVaoSo"
              label="Số vào sổ"
              rules={[{ required: true }]}
            >
              <Input maxLength={180} />
            </Form.Item>
            <Form.Item name="className" label="Lớp">
              <Input maxLength={100} />
            </Form.Item>
            <Form.Item
              name="namTotNghiep"
              label="Năm tốt nghiệp đã xác nhận"
              rules={[{ required: true }]}
            >
              <InputNumber
                min={1900}
                max={new Date().getFullYear()}
                className="w-full"
              />
            </Form.Item>
            <Form.Item
              name="issueDate"
              label="Ngày cấp thực tế"
              rules={[{ required: true }]}
            >
              <DatePicker format="DD/MM/YYYY" className="w-full" />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" loading={loading}>
            Lưu và gửi phê duyệt
          </Button>
        </Form>
      </Card>
    </div>
  );
}
