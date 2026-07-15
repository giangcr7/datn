import React from "react";
import { Metadata } from "next";
import ImportClient from "./ImportClient"; // Đảm bảo file ImportClient.tsx nằm cùng thư mục

export const metadata: Metadata = {
  title: "Nhập liệu sinh viên | Hệ thống Quản lý Văn bằng",
  description: "Tải lên danh sách sinh viên tốt nghiệp từ file Excel.",
};

export default function ImportPage() {
  return (
    <ImportClient />
  );
}