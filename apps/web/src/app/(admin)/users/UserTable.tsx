// src/app/(admin)/users/UserTable.tsx
"use client";

import React, { useState } from "react";
import { Table, Typography, Input, Tag, Row, Col } from "antd";
import { SearchOutlined } from "@ant-design/icons";

const { Title } = Typography;

interface UserData {
  key: string;
  stt: number;
  fullName: string;
  email: string;
  role: string;
  active: boolean;
}

interface UserTableProps {
  data: UserData[];
}

export default function UserTable({ data }: UserTableProps) {
  const [searchText, setSearchText] = useState("");

  // Xử lý bộ lọc tìm kiếm tại Client
  const filteredData = data.filter(
    (user) =>
      user.fullName.toLowerCase().includes(searchText.toLowerCase()) ||
      user.email.toLowerCase().includes(searchText.toLowerCase()),
  );

  const columns = [
    {
      title: "STT",
      dataIndex: "stt",
      key: "stt",
      width: 70,
      align: "center" as const,
    },
    {
      title: "Họ Tên",
      dataIndex: "fullName",
      key: "fullName",
      sorter: (a: UserData, b: UserData) =>
        a.fullName.localeCompare(b.fullName),
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
    },
    {
      title: "Vai trò",
      dataIndex: "role",
      key: "role",
      render: (role: string) => {
        let color = "default";
        if (role === "ADMIN") color = "red";
        if (role === "UNIVERSITY") color = "blue";
        if (role === "STUDENT") color = "green";
        return (
          <Tag color={color} className="font-semibold">
            {role}
          </Tag>
        );
      },
    },
    {
      title: "Trạng thái tài khoản",
      dataIndex: "active",
      key: "active",
      render: (active: boolean) => (
        <Tag color={active ? "success" : "warning"}>
          {active ? "ĐANG HOẠT ĐỘNG" : "ĐÃ KHÓA"}
        </Tag>
      ),
    },
  ];

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 max-w-6xl mx-auto">
      <Title
        level={3}
        className="text-center mb-8"
        style={{ color: "#1890ff" }}
      >
        DANH SÁCH TÀI KHOẢN HỆ THỐNG
      </Title>

      <Row justify="space-between" align="middle" className="mb-6">
        <Col>
          {/* Thanh tìm kiếm thời gian thực */}
          <Input
            placeholder="Tìm kiếm theo tên hoặc email..."
            prefix={<SearchOutlined className="text-gray-400" />}
            size="large"
            style={{ width: 350 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={filteredData}
        bordered
        pagination={{
          pageSize: 10,
          position: ["bottomCenter"],
          showTotal: (total, range) =>
            `Hiển thị ${range[0]}-${range[1]} trong tổng số ${total} tài khoản`,
        }}
        locale={{ emptyText: "Không tìm thấy người dùng nào phù hợp" }}
      />
    </div>
  );
}
