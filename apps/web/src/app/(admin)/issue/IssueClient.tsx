"use client";

import React, { useState } from "react";
import {
  Form,
  Select,
  Input,
  InputNumber,
  Button,
  Typography,
  message,
  Card,
  DatePicker,
} from "antd";
import { useRouter } from "next/navigation";

const { Title } = Typography;

export default function IssueClient({ students }: { students: any[] }) {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const router = useRouter();

  const handleIssue = async (values: any) => {
    setLoading(true);
    // Chuẩn hóa định dạng ngày tháng trước khi gửi
    const payload = {
        ...values,
        decisionDate: values.decisionDate?.format("YYYY-MM-DD"),
    };
    
    try {
      const res = await fetch("/api/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        message.success("Đã ký số và ghi sổ cái Blockchain thành công!");
        router.push("/dashboard");
      } else {
        message.error("Lỗi khi ghi dữ liệu lên mạng lưới.");
      }
    } catch (error) {
      message.error("Lỗi kết nối máy chủ.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 bg-white min-h-screen">
      <div className="max-w-3xl mx-auto">
        <Title level={2} className="mb-2">CẤP PHÁT VĂN BẰNG ĐƠN LẺ</Title>

        <Card variant="borderless" className="bg-gray-50 border-t-4 border-t-green-600 shadow-sm">
          <Form form={form} layout="vertical" onFinish={handleIssue}>
            {/* THÔNG TIN CHÍNH */}
            <Form.Item name="studentObjId" label="Chọn Sinh viên" rules={[{ required: true }]}>
              <Select options={students} size="large" placeholder="Tra cứu sinh viên..." showSearch />
            </Form.Item>

            <Form.Item name="major" label="Ngành đào tạo" rules={[{ required: true }]}>
              <Input size="large" placeholder="VD: Kỹ thuật phần mềm" />
            </Form.Item>

            {/* ĐIỂM SỐ & XẾP LOẠI */}
            <div className="flex gap-4">
              <Form.Item name="gpa" label="Điểm trung bình (GPA)" className="flex-1" rules={[{ required: true }]}>
                <InputNumber size="large" style={{ width: "100%" }} step={0.01} max={4.0} min={0.0} />
              </Form.Item>
              <Form.Item name="classification" label="Xếp loại" className="flex-1" rules={[{ required: true }]}>
                <Select size="large" options={[{value:"Xuất sắc", label:"Xuất sắc"}, {value:"Giỏi", label:"Giỏi"}, {value:"Khá", label:"Khá"}]} />
              </Form.Item>
            </div>

            {/* CÁC TRƯỜNG BỔ SUNG ĐỒNG BỘ VỚI IMPORT EXCEL */}
            <div className="flex gap-4">
              <Form.Item name="soHieu" label="Số hiệu văn bằng" className="flex-1" rules={[{ required: true }]}>
                <Input size="large" placeholder="VD: 570069" />
              </Form.Item>
              <Form.Item name="soVaoSo" label="Số vào sổ" className="flex-1" rules={[{ required: true }]}>
                <Input size="large" placeholder="VD: 4.06.S16..." />
              </Form.Item>
            </div>

            <div className="flex gap-4">
              <Form.Item name="className" label="Lớp" className="flex-1">
                <Input size="large" placeholder="VD: S16-55C-TL1" />
              </Form.Item>
              <Form.Item name="namTotNghiep" label="Năm tốt nghiệp" className="flex-1">
                <InputNumber size="large" style={{ width: "100%" }} />
              </Form.Item>
            </div>

            <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ backgroundColor: "#389e0d" }}>
              Phát hành lên Blockchain
            </Button>
          </Form>
        </Card>
      </div>
    </div>
  );
}