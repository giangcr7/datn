"use client";

import React, { useEffect, useState, Suspense } from "react";
import { Form, Input, Button, Typography, Tabs, Checkbox, message } from "antd";
import { UserOutlined, LockOutlined, LoginOutlined } from "@ant-design/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import styles from "@/styles/public-pages.module.css";
import {
  clearRememberedEmail,
  readRememberedEmail,
  saveRememberedEmail,
  type LoginRole,
} from "@/lib/remember-login";

const { Text } = Typography;

type LoginValues = {
  email: string;
  password: string;
  role: LoginRole;
  remember: boolean;
};

function LoginForm({ role }: { role: LoginRole }) {
  const [form] = Form.useForm<LoginValues>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const email = readRememberedEmail(role);
    if (email && !form.isFieldTouched("email")) {
      form.setFieldsValue({ email, remember: true });
    }
  }, [form, role]);

  const onFinish = async (values: LoginValues) => {
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: values.email,
        password: values.password,
        role: role.toUpperCase(),
        remember: values.remember ? "true" : "false",
      });

      if (!result?.ok || result.error) {
        message.error(result?.error || "Đăng nhập thất bại. Vui lòng thử lại!");
        return;
      }
      if (values.remember) saveRememberedEmail(role, values.email);
      else clearRememberedEmail(role);
      message.success("Đăng nhập thành công!");
      router.push(role === "student" ? "/student/dashboard" : "/dashboard");
      router.refresh();
    } catch {
      message.error("Lỗi kết nối máy chủ. Vui lòng thử lại!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form
      form={form}
      name={`login-${role}`}
      autoComplete="on"
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
          autoComplete="username"
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
          autoComplete="current-password"
          prefix={<LockOutlined style={{ color: "rgba(0,0,0,.25)" }} />}
          placeholder="Mật khẩu"
          size="large"
        />
      </Form.Item>

      <div className={styles.remember}>
        <Form.Item name="remember" valuePropName="checked" noStyle>
          <Checkbox
            title="Nhớ email và giữ phiên đăng nhập trên trình duyệt này"
            onChange={(event) => {
              if (!event.target.checked) clearRememberedEmail(role);
            }}
          >
            Ghi nhớ đăng nhập
          </Checkbox>
        </Form.Item>
        <Text type="secondary">
          Email được nhớ trên thiết bị này. Mật khẩu do trình duyệt quản lý nếu
          anh cho phép.
        </Text>
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
}

function LoginContent() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("type") || "student";
  const [activeTab, setActiveTab] = useState(defaultTab);

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
              children: <LoginForm role="student" />,
            },
            {
              key: "university",
              label: "Nhà trường",
              children: <LoginForm role="university" />,
            },
            {
              key: "admin",
              label: "Quản trị viên",
              children: <LoginForm role="admin" />,
            },
          ]}
        />

        {/* LOGIC HIỂN THỊ CÓ ĐIỀU KIỆN (CONDITIONAL RENDERING) */}
        {activeTab === "student" ? (
          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <Text type="secondary">
              Chưa nhận được mật khẩu tạm thời? Vui lòng liên hệ nhà trường để
              gửi lại.
            </Text>
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
