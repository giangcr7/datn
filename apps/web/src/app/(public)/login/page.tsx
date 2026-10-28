"use client";

import React, { useState, Suspense } from "react";
import { Form, Input, Button, Typography, Tabs, Checkbox, message } from "antd";
import { UserOutlined, LockOutlined, LoginOutlined } from "@ant-design/icons";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import styles from "@/styles/public-pages.module.css";

const { Text } = Typography;

type LoginValues = {
  email: string;
  password: string;
  role: string;
  remember: boolean;
};

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Đọc tham số từ URL (ví dụ: /login?type=university)
  const defaultTab = searchParams.get("type") || "student";

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab);

  const onFinish = async (values: LoginValues) => {
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: values.email,
        password: values.password,
        role: values.role.toUpperCase(), // Map 'STUDENT' hoặc 'UNIVERSITY'
        remember: values.remember ? "true" : "false",
      });

      if (res?.error) {
        message.error(res.error);
      } else {
        message.success("Đăng nhập thành công!");
        if (values.role === "university" || values.role === "admin") {
          router.push("/dashboard");
        } else {
          router.push("/student/dashboard");
        }
        router.refresh();
      }
    } catch (error) {
      message.error("Lỗi kết nối máy chủ. Vui lòng thử lại!");
    } finally {
      setLoading(false);
    }
  };

  const renderLoginForm = (role: string) => (
    <Form
      layout="vertical"
      initialValues={{ role, remember: false }}
      onFinish={onFinish}
      style={{ marginTop: "20px" }}
    >
      <Form.Item name="role" hidden>
        <Input />
      </Form.Item>

      <Form.Item
        name="email"
        label="Email"
        rules={[
          {
            required: true,
            type: "email",
            message: "Vui lòng nhập Email hợp lệ!",
          },
        ]}
      >
        <Input
          prefix={<UserOutlined style={{ color: "rgba(0,0,0,.25)" }} />}
          placeholder={
            role === "university"
              ? "Email cán bộ (@tlu.edu.vn)"
              : "Email sinh viên"
          }
          size="large"
        />
      </Form.Item>

      <Form.Item
        name="password"
        label="Mật khẩu"
        rules={[{ required: true, message: "Vui lòng nhập mật khẩu!" }]}
      >
        <Input.Password
          prefix={<LockOutlined style={{ color: "rgba(0,0,0,.25)" }} />}
          placeholder="Mật khẩu"
          size="large"
        />
      </Form.Item>

      <div className={styles.remember}>
        <Form.Item name="remember" valuePropName="checked" noStyle>
          <Checkbox title="Giữ đăng nhập trong 7 ngày trên trình duyệt này">
            Ghi nhớ đăng nhập
          </Checkbox>
        </Form.Item>
        <Text type="secondary">Liên hệ quản trị viên nếu quên mật khẩu</Text>
      </div>

      <Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          icon={<LoginOutlined />}
          style={{ height: "45px" }}
          loading={loading}
        >
          Đăng nhập
        </Button>
      </Form.Item>
    </Form>
  );

  return (
    <div className={styles.content}>
      <section className={styles.introduction} aria-labelledby="login-title">
        <h1 id="login-title">Đăng nhập hệ thống</h1>
        <p>
          Truy cập các chức năng văn bằng theo tài khoản được nhà trường cấp.
        </p>
      </section>
      <div className={styles.accountPanel}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key)}
          centered
          items={[
            {
              key: "student",
              label: "Sinh viên",
              children: renderLoginForm("student"),
            },
            {
              key: "university",
              label: "Nhà trường",
              children: renderLoginForm("university"),
            },
            {
              key: "admin",
              label: "Quản trị viên",
              children: renderLoginForm("admin"),
            },
          ]}
        />

        {/* LOGIC HIỂN THỊ CÓ ĐIỀU KIỆN (CONDITIONAL RENDERING) */}
        {activeTab === "student" ? (
          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <Text>Bạn chưa kích hoạt tài khoản? </Text>
            <Link
              href="/register/student" // Đã trỏ chuẩn về thư mục thiết kế
              style={{ color: "var(--school-primary)", fontWeight: 500 }}
            >
              Kích hoạt ngay
            </Link>
          </div>
        ) : (
          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <Text
              type="secondary"
              style={{ fontStyle: "italic", fontSize: "13px" }}
            >
              Tài khoản Cán bộ do Ban Quản trị hệ thống khởi tạo và cấp phát.
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-screen">
          Đang tải...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
