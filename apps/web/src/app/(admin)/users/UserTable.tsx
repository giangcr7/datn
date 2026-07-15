// src/app/(admin)/users/UserTable.tsx
'use client';

import React, { useState } from 'react';
import { Table, Typography, Input, Button, Tag, Row, Col } from 'antd';
import { EditOutlined, SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const { Title } = Typography;

interface UserData {
  key: string;
  stt: number;
  fullName: string;
  email: string;
  role: string;
  hasCertificate: boolean;
}

interface UserTableProps {
  data: UserData[];
}

export default function UserTable({ data }: UserTableProps) {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');

  // Xử lý bộ lọc tìm kiếm tại Client
  const filteredData = data.filter(user =>
    user.fullName.toLowerCase().includes(searchText.toLowerCase()) ||
    user.email.toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: 'STT',
      dataIndex: 'stt',
      key: 'stt',
      width: 70,
      align: 'center' as const,
    },
    {
      title: 'Họ Tên',
      dataIndex: 'fullName',
      key: 'fullName',
      sorter: (a: UserData, b: UserData) => a.fullName.localeCompare(b.fullName),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => {
        let color = 'default';
        if (role === 'ADMIN') color = 'red';
        if (role === 'UNIVERSITY') color = 'blue';
        if (role === 'STUDENT') color = 'green';
        return <Tag color={color} className="font-semibold">{role}</Tag>;
      }
    },
    {
      title: 'Trạng thái Fabric CA',
      dataIndex: 'hasCertificate',
      key: 'hasCertificate',
      render: (hasCert: boolean) => (
         <Tag color={hasCert ? 'success' : 'warning'}>
           {hasCert ? 'ĐÃ CẤP X.509' : 'CHỜ DUYỆT'}
         </Tag>
      )
    },
    {
      title: 'Thao tác',
      key: 'action',
      align: 'center' as const,
      render: () => (
        <Button type="text" icon={<EditOutlined className="text-yellow-500 text-lg" />} />
      ),
    },
  ];

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 max-w-6xl mx-auto">
      <Title level={3} className="text-center mb-8" style={{ color: '#1890ff' }}>
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
            onChange={e => setSearchText(e.target.value)}
            allowClear
          />
        </Col>
        <Col>
          <Button 
            type="primary" 
            size="large" 
            className="bg-blue-600"
            onClick={() => router.push('/users/create')} // Điều hướng tới trang tạo user mới
          >
            <PlusOutlined /> Thêm tài khoản
          </Button>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={filteredData}
        bordered
        pagination={{ 
          pageSize: 10, 
          position: ['bottomCenter'],
          showTotal: (total, range) => `Hiển thị ${range[0]}-${range[1]} trong tổng số ${total} tài khoản`
        }}
        locale={{ emptyText: 'Không tìm thấy người dùng nào phù hợp' }}
      />
    </div>
  );
}