"use client";
import React, { useState } from "react";
import { Form, Input, Button, Alert } from "antd";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import styles from "@/styles/public-pages.module.css";

function ChangePasswordContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const loginType = ["student", "university", "admin"].includes(role || "")
    ? `type=${role}&`
    : "";

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
          router.push(`/login?${loginType}msg=changed`);
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
    <div className={styles.content}>
      <section className={styles.introduction} aria-labelledby="password-title">
        <h1 id="password-title">Đổi mật khẩu</h1>
        <p>Cập nhật mật khẩu để bảo vệ tài khoản truy cập hệ thống.</p>
      </section>
      <div className={styles.accountPanel}>
        {success && (
          <Alert
            title="Đổi mật khẩu thành công! Đang chuyển hướng..."
            type="success"
            showIcon
            className="mb-4"
          />
        )}
        {error && (
          <Alert title={error} type="error" showIcon className="mb-4" />
        )}

        <Form layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="Mật khẩu hiện tại"
            name="currentPassword"
            rules={[
              { required: true, message: "Vui lòng nhập mật khẩu hiện tại!" },
            ]}
          >
            <Input.Password
              size="large"
              placeholder="Nhập mật khẩu tạm từ email"
            />
          </Form.Item>
          <Form.Item
            label="Mật khẩu mới"
            name="newPassword"
            rules={[
              { required: true, message: "Vui lòng nhập mật khẩu mới!" },
              { min: 6, message: "Ít nhất 6 ký tự!" },
            ]}
          >
            <Input.Password size="large" placeholder="Nhập mật khẩu mới" />
          </Form.Item>
          <Form.Item
            label="Xác nhận mật khẩu mới"
            name="confirmPassword"
            rules={[{ required: true, message: "Vui lòng xác nhận mật khẩu!" }]}
          >
            <Input.Password size="large" placeholder="Nhập lại mật khẩu mới" />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={loading}
          >
            Đổi mật khẩu
          </Button>
        </Form>
      </div>
    </div>
  );
}

export default function ChangePasswordPage() {
  return <ChangePasswordContent />;
}
