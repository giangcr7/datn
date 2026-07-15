"use client";
import React, { useState } from "react";
import { Upload, Button, Table, Alert, Card, Typography, Space, Tag, Steps } from "antd";
import { InboxOutlined, DownloadOutlined, CheckCircleOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;
const { Dragger } = Upload;

export default function ImportStudentsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleUpload = async (file: File) => {
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/students/import", { method: "POST", body: formData });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, error: "Lỗi kết nối máy chủ" });
    } finally {
      setLoading(false);
    }
    return false;
  };

  const downloadTemplate = () => {
    const XLSX = require("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["MSSV", "Họ và tên", "Email"],
      ["22110001", "Nguyễn Văn A", "nguyenvana@gmail.com"],
      ["22110002", "Trần Thị B", "tranthib@gmail.com"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DanhSachSinhVien");
    XLSX.writeFile(wb, "Template_DanhSachSinhVien.xlsx");
  };

  return (
    <div className="p-8 bg-white min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Title level={2}>Import Danh Sách Sinh Viên</Title>
          <Text type="secondary">Upload file Excel để tạo tài khoản hàng loạt và gửi email thông báo tự động</Text>
        </div>

        <Steps className="mb-8" items={[
          { title: "Tải template", description: "Download file mẫu", status: "finish", icon: <DownloadOutlined /> },
          { title: "Điền dữ liệu", description: "Thêm MSSV, tên, email", status: "process" },
          { title: "Upload", description: "Kéo thả file Excel", status: "wait" },
          { title: "Hoàn tất", description: "Sinh viên nhận email", status: "wait", icon: <CheckCircleOutlined /> },
        ]} />

        <Card className="mb-6">
          <Space className="mb-4">
            <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
              Tải file template mẫu
            </Button>
            <Text type="secondary">File cần có 3 cột: MSSV, Họ và tên, Email</Text>
          </Space>

          <Dragger
            accept=".xlsx,.xls"
            beforeUpload={handleUpload}
            showUploadList={false}
            disabled={loading}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Kéo thả file Excel vào đây hoặc nhấn để chọn</p>
            <p className="ant-upload-hint">Hỗ trợ .xlsx và .xls — Hệ thống sẽ tự động tạo tài khoản và gửi email</p>
          </Dragger>
        </Card>

        {loading && <Alert message="Đang xử lý... Vui lòng chờ" type="info" showIcon className="mb-4" />}

        {result && (
          <Card title="Kết quả Import">
            <Alert
              message={result.success ? result.message : result.error}
              type={result.success ? "success" : "error"}
              showIcon
              className="mb-4"
            />
            {result.success && (
              <Space size="large" className="mb-4">
                <Tag color="green">✅ Tạo mới: {result.created}</Tag>
                <Tag color="orange">⏭️ Bỏ qua: {result.skipped}</Tag>
                <Tag color="blue">📧 Tổng: {result.total}</Tag>
                {result.emailFailed > 0 && <Tag color="red">❌ Email lỗi: {result.emailFailed}</Tag>}
              </Space>
            )}
            {result.errors?.length > 0 && (
              <div>
                <Text type="danger" strong>Chi tiết lỗi:</Text>
                {result.errors.map((e: string, i: number) => (
                  <div key={i} className="text-red-500 text-sm mt-1">• {e}</div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
