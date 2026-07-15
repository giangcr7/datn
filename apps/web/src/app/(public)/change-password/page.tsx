"use client";
import React, { useState } from "react";
import { Card, Form, Input, Button, Typography, Alert } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

const { Title, Text } = Typography;

function ChangePasswordContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (values: any) => {
    if (values.newPassword !== values.confirmPassword) {
      setError("Mật khẩu mới không khớp!");
      return;
    }
    setLoading(true);
    setError("");
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
        setSuccess(true);
        setTimeout(async () => {
          await signOut({ redirect: false });
          router.push("/login?type=student&msg=changed");
        }, 1500);
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card style={{ width: 440, borderRadius: 12 }}>
        <div className="text-center mb-6">
          <LockOutlined style={{ fontSize: 40, color: "#0056b3" }} />
          <Title level={3} style={{ marginTop: 12, marginBottom: 4 }}>Đổi Mật Khẩu</Title>
          <Text type="secondary">Vui lòng đổi mật khẩu để kích hoạt tài khoản</Text>
        </div>

        {success && (
          <Alert message="Đổi mật khẩu thành công! Đang chuyển hướng..." type="success" showIcon className="mb-4" />
        )}
        {error && (
          <Alert message={error} type="error" showIcon className="mb-4" />
        )}

        <Form layout="vertical" onFinish={handleSubmit}>
          <Form.Item label="Mật khẩu hiện tại" name="currentPassword" rules={[{ required: true, message: "Vui lòng nhập mật khẩu hiện tại!" }]}>
            <Input.Password size="large" placeholder="Nhập mật khẩu tạm từ email" />
          </Form.Item>
          <Form.Item label="Mật khẩu mới" name="newPassword" rules={[{ required: true, message: "Vui lòng nhập mật khẩu mới!" }, { min: 6, message: "Ít nhất 6 ký tự!" }]}>
            <Input.Password size="large" placeholder="Nhập mật khẩu mới" />
          </Form.Item>
          <Form.Item label="Xác nhận mật khẩu mới" name="confirmPassword" rules={[{ required: true, message: "Vui lòng xác nhận mật khẩu!" }]}>
            <Input.Password size="large" placeholder="Nhập lại mật khẩu mới" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ background: "#0056b3" }}>
            Đổi mật khẩu
          </Button>
        </Form>
      </Card>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    
      <ChangePasswordContent />
    
  );
}
