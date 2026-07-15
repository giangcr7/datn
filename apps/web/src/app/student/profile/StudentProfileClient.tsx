"use client";
import React, { useState } from "react";
import { Card, Row, Col, Typography, Button, Form, Input, Alert, Avatar, Tag, Divider } from "antd";
import { UserOutlined, LockOutlined, MailOutlined, IdcardOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";

const { Title, Text } = Typography;

interface Props {
  user: {
    name: string;
    email: string;
    mssv: string;
    role: string;
    createdAt: string;
  };
}

export default function StudentProfileClient({ user }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChangePassword = async (values: any) => {
    if (values.newPassword !== values.confirmPassword) {
      setError("Mật khẩu mới không khớp!");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess("Đổi mật khẩu thành công!");
      } else {
        setError(data.error);
      }
    } catch {
      setError("Lỗi kết nối máy chủ!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/student/dashboard")}>
            Quay lại
          </Button>
          <Title level={3} style={{ margin: 0 }}>Thông tin tài khoản</Title>
        </div>

        <Row gutter={[24, 24]}>
          {/* Thông tin cá nhân */}
          <Col span={24}>
            <Card bordered={false} className="shadow-sm rounded-xl">
              <div className="flex items-center gap-4 mb-6">
                <Avatar size={72} icon={<UserOutlined />} style={{ background: "#0056b3" }} />
                <div>
                  <Title level={4} style={{ margin: 0 }}>{user.name}</Title>
                  <Tag color="blue">Sinh viên</Tag>
                </div>
              </div>
              <Divider />
              <Row gutter={[24, 16]}>
                <Col xs={24} sm={12}>
                  <div className="flex items-center gap-2 mb-1">
                    <IdcardOutlined style={{ color: "#0056b3" }} />
                    <Text type="secondary">Mã số sinh viên</Text>
                  </div>
                  <Text strong style={{ fontSize: 16 }}>{user.mssv}</Text>
                </Col>
                <Col xs={24} sm={12}>
                  <div className="flex items-center gap-2 mb-1">
                    <MailOutlined style={{ color: "#0056b3" }} />
                    <Text type="secondary">Email</Text>
                  </div>
                  <Text strong style={{ fontSize: 16 }}>{user.email}</Text>
                </Col>
                <Col xs={24} sm={12}>
                  <div className="flex items-center gap-2 mb-1">
                    <UserOutlined style={{ color: "#0056b3" }} />
                    <Text type="secondary">Ngày tạo tài khoản</Text>
                  </div>
                  <Text>{user.createdAt ? new Date(user.createdAt).toLocaleDateString("vi-VN") : "N/A"}</Text>
                </Col>
                <Col xs={24} sm={12}>
                  <div className="flex items-center gap-2 mb-1">
                    <LockOutlined style={{ color: "#0056b3" }} />
                    <Text type="secondary">Trạng thái</Text>
                  </div>
                  <Tag color="green">✅ Đã kích hoạt</Tag>
                </Col>
              </Row>
            </Card>
          </Col>

          {/* Đổi mật khẩu */}
          <Col span={24}>
            <Card title={<span><LockOutlined /> Đổi mật khẩu</span>} bordered={false} className="shadow-sm rounded-xl">
              {error && <Alert message={error} type="error" showIcon className="mb-4" />}
              {success && <Alert message={success} type="success" showIcon className="mb-4" />}
              <Form layout="vertical" onFinish={handleChangePassword}>
                <Form.Item label="Mật khẩu hiện tại" name="currentPassword" rules={[{ required: true, message: "Vui lòng nhập mật khẩu hiện tại!" }]}>
                  <Input.Password size="large" placeholder="Nhập mật khẩu hiện tại" />
                </Form.Item>
                <Form.Item label="Mật khẩu mới" name="newPassword" rules={[{ required: true }, { min: 6, message: "Ít nhất 6 ký tự!" }]}>
                  <Input.Password size="large" placeholder="Nhập mật khẩu mới" />
                </Form.Item>
                <Form.Item label="Xác nhận mật khẩu mới" name="confirmPassword" rules={[{ required: true }]}>
                  <Input.Password size="large" placeholder="Nhập lại mật khẩu mới" />
                </Form.Item>
                <Button type="primary" htmlType="submit" size="large" loading={loading} style={{ background: "#0056b3" }}>
                  Cập nhật mật khẩu
                </Button>
              </Form>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
}
