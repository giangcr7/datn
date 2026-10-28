"use client";

import PageTitle from "@/components/PageTitle";
import React, { useState } from "react";
import { Upload, Button, Alert, Typography, Space } from "antd";
import {
  InboxOutlined,
  DownloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;
const { Dragger } = Upload;

type ImportResult = {
  success: boolean;
  created?: number;
  skipped?: number;
  failed?: number;
  total?: number;
  error?: string;
  message?: string;
  errors?: (string | { row: number; message: string })[];
};

export default function ImportStudentsClient() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const handleUpload = async (file: File) => {
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/students/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({
        success: false,
        error:
          "Không nhận được kết quả nhập. Kiểm tra danh sách sinh viên trước khi thử lại vì dữ liệu có thể đã được lưu.",
      });
    } finally {
      setLoading(false);
    }
    return false;
  };

  const downloadTemplate = () => {
    const XLSX = require("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["MSSV", "Họ và tên", "Email"],
      ["0099999981", "Sinh viên Mẫu Một", "student.one@example.com"],
      ["0099999982", "Sinh viên Mẫu Hai", "student.two@example.com"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DanhSachSinhVien");
    XLSX.writeFile(wb, "Template_DanhSachSinhVien.xlsx");
  };

  return (
    <div className="workspace-page">
      <div className="min-w-0">
        <div className="mb-8">
          <PageTitle>Nhập hồ sơ sinh viên</PageTitle>
        </div>

        <section className="mb-6 border-t border-gray-200 pt-4">
          <Space wrap className="mb-4">
            <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
              Tải mẫu Excel
            </Button>
          </Space>

          <Dragger
            accept=".xlsx"
            beforeUpload={(selected) => {
              setFile(selected);
              setResult(null);
              return false;
            }}
            onRemove={() => setFile(null)}
            showUploadList={false}
            disabled={loading}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              {file ? file.name : "Chọn hoặc kéo file Excel vào đây"}
            </p>
            <p className="ant-upload-hint">
              .xlsx, tối đa 1.000 sinh viên, gồm MSSV, Họ và tên, Email
            </p>
          </Dragger>
          <Button
            className="mt-4"
            type="primary"
            icon={<UploadOutlined />}
            disabled={!file}
            loading={loading}
            onClick={() => file && handleUpload(file)}
          >
            Nhập sinh viên
          </Button>
        </section>

        {loading && (
          <Alert
            title="Đang xử lý... Vui lòng chờ"
            type="info"
            showIcon
            className="mb-4"
          />
        )}

        {result && (
          <section className="border-t border-gray-200 pt-4">
            <Title level={4}>Kết quả nhập</Title>
            <Alert
              title={
                result.success
                  ? result.message ||
                    (result.failed
                      ? "Đã xử lý file, có dòng cần sửa dữ liệu."
                      : "Đã xử lý xong danh sách sinh viên.")
                  : result.error || result.message || "Không nhập được file"
              }
              type={
                result.success
                  ? result.failed
                    ? "warning"
                    : "success"
                  : "error"
              }
              showIcon
              className="mb-4"
            />
            {result.success && (
              <Space wrap size="large" className="mb-4">
                <Text>
                  Tạo mới: <strong>{result.created}</strong>
                </Text>
                <Text>
                  Đã tồn tại (bỏ qua): <strong>{result.skipped}</strong>
                </Text>
                <Text>
                  Tổng dòng: <strong>{result.total}</strong>
                </Text>
                {!!result.failed && (
                  <Text type="danger">
                    Dòng lỗi: <strong>{result.failed}</strong>
                  </Text>
                )}
              </Space>
            )}
            {result.errors && result.errors.length > 0 && (
              <div>
                <Text type="danger" strong>
                  Chi tiết lỗi:
                </Text>
                {result.errors.map(
                  (
                    entry: string | { row: number; message: string },
                    index: number,
                  ) => (
                    <div key={index} className="text-red-500 text-sm mt-1">
                      •{" "}
                      {typeof entry === "string"
                        ? entry
                        : `Dòng ${entry.row}: ${entry.message}`}
                    </div>
                  ),
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
