"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Typography, Tag, Input, Space, message, Tooltip } from 'antd';
import { SearchOutlined, UserAddOutlined, FileExcelOutlined, ReloadOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const { Title, Text } = Typography;

export default function StudentsClient({ initialData }: { initialData: any[] }) {
  const router = useRouter();
  const [data, setData] = useState<any[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const fetchStudents = useCallback(async (page = 1, limit = 20, q = "") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/students?page=${page}&limit=${limit}&search=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setPagination(prev => ({ ...prev, current: page, pageSize: limit, total: json.total }));
      }
    } catch { message.error("Lỗi tải dữ liệu!"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const columns = [
    { 
      title: 'Họ và tên', 
      dataIndex: 'name', 
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>
    },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { 
      title: 'MSSV', 
      dataIndex: 'studentId', 
      key: 'studentId',
      render: (text: string) => <Text code>{text}</Text>
    },
    {
      title: 'Trạng thái',
      dataIndex: 'hasPassword',
      key: 'hasPassword',
      render: (has: boolean) => has 
        ? <Tag color="green">✅ Đã kích hoạt</Tag>
        : <Tag color="orange">⏳ Chưa kích hoạt</Tag>
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => date ? new Date(date).toLocaleDateString('vi-VN') : 'N/A'
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title="Xem văn bằng của sinh viên này">
            <Button size="small" onClick={() => router.push(`/certificates?search=${record.studentId}`)}>
              Văn bằng
            </Button>
          </Tooltip>
        </Space>
      )
    }
  ];

  return (
    <div className="p-8 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <Title level={2} style={{ margin: 0 }}>QUẢN LÝ SINH VIÊN</Title>
          <Space>
            <Button 
              icon={<FileExcelOutlined />}
              onClick={() => router.push('/students/import')}
            >
              Import Excel
            </Button>
            <Button 
              icon={<ReloadOutlined />}
              onClick={() => fetchStudents(1, pagination.pageSize, search)}
            >
              Làm mới
            </Button>
          </Space>
        </div>

        <div className="mb-4">
          <Input
            prefix={<SearchOutlined />}
            placeholder="Tìm theo tên, MSSV, email..."
            allowClear
            size="large"
            style={{ maxWidth: 400 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={() => fetchStudents(1, pagination.pageSize, search)}
          />
          <Button
            type="primary"
            className="ml-2"
            onClick={() => fetchStudents(1, pagination.pageSize, search)}
          >
            Tìm kiếm
          </Button>
        </div>

        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          bordered
          size="small"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `Tổng ${total} sinh viên`,
            onChange: (page, pageSize) => fetchStudents(page, pageSize, search),
          }}
        />
      </div>
    </div>
  );
}
