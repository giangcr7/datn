"use client";

import React, { useState, useEffect } from "react";
import { Form, Input, Button, Typography, message, Space, Alert } from "antd";
import {
  LockOutlined,
  IdcardOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "@/styles/public-pages.module.css";

const { Text } = Typography;

export default function StudentRegister() {
  const router = useRouter();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [otpSent, setOtpSent] = useState(false);

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendOtp = async () => {
    try {
      const values = await form.validateFields(["mssv", "email"]);
      setSendingOtp(true);

      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mssv: values.mssv.trim(),
          email: values.email.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        message.success(data.message || "Mã OTP đã được gửi đến email!");
        setOtpSent(true);
        setCountdown(60);
      } else {
        message.error(
          data.error ||
            "Không thể gửi mã OTP. Vui lòng kiểm tra lại MSSV và Email!",
        );
      }
    } catch (err: any) {
      if (err?.errorFields) {
        message.warning(
          "Vui lòng nhập chính xác MSSV và Email trước khi nhận mã OTP!",
        );
      } else {
        message.error("Lỗi kết nối máy chủ!");
      }
    } finally {
      setSendingOtp(false);
    }
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mssv: values.mssv.trim(),
          email: values.email.trim(),
          password: values.password,
          otp: values.otp?.trim(),
          role: "STUDENT",
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        message.success(data.message || "Kích hoạt tài khoản thành công!");
        router.push("/login?type=student");
      } else {
        message.error(
          data.error || "Kích hoạt thất bại! Vui lòng kiểm tra lại mã OTP.",
        );
      }
    } catch (error) {
      message.error("Lỗi kết nối máy chủ. Vui lòng thử lại sau!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.content}>
      <section className={styles.introduction} aria-labelledby="register-title">
        <h1 id="register-title">Kích hoạt tài khoản sinh viên</h1>
        <p>Sử dụng mã số sinh viên và email đã đăng ký tại nhà trường.</p>
      </section>
      <div className={styles.accountPanel}>
        {otpSent && (
          <Alert
            title="Mã OTP 6 số đã được gửi tới email sinh viên của bạn. Mã có hiệu lực trong 5 phút."
            type="info"
            showIcon
            style={{ marginBottom: "20px" }}
          />
        )}

        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="mssv"
            label="Mã số sinh viên (MSSV)"
            rules={[
              { required: true, message: "Vui lòng nhập Mã số sinh viên!" },
            ]}
          >
            <Input
              prefix={<IdcardOutlined style={{ color: "rgba(0,0,0,.25)" }} />}
              placeholder="Ví dụ: 2151060001"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email sinh viên"
            rules={[
              {
                required: true,
                type: "email",
                message: "Vui lòng nhập Email hợp lệ!",
              },
            ]}
          >
            <Input
              prefix={<MailOutlined style={{ color: "rgba(0,0,0,.25)" }} />}
              placeholder="Email đã đăng ký tại trường"
              size="large"
            />
          </Form.Item>

          <Form.Item label="Xác thực OTP qua Email" required>
            <Space.Compact style={{ width: "100%" }}>
              <Form.Item
                name="otp"
                noStyle
                rules={[
                  { required: true, message: "Vui lòng nhập mã OTP 6 số!" },
                ]}
              >
                <Input
                  prefix={
                    <SafetyCertificateOutlined
                      style={{ color: "rgba(0,0,0,.25)" }}
                    />
                  }
                  placeholder="Nhập mã 6 số"
                  maxLength={6}
                  size="large"
                />
              </Form.Item>
              <Button
                type="primary"
                size="large"
                onClick={handleSendOtp}
                loading={sendingOtp}
                disabled={countdown > 0}
                icon={<SendOutlined />}
                style={{}}
              >
                {countdown > 0 ? `Gửi lại (${countdown}s)` : "Gửi mã OTP"}
              </Button>
            </Space.Compact>
          </Form.Item>

          <Form.Item
            name="password"
            label="Mật khẩu mới"
            rules={[
              {
                required: true,
                min: 6,
                message: "Mật khẩu phải có ít nhất 6 ký tự!",
              },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: "rgba(0,0,0,.25)" }} />}
              placeholder="Tạo mật khẩu đăng nhập"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="Xác nhận mật khẩu"
            dependencies={["password"]}
            rules={[
              { required: true, message: "Vui lòng xác nhận mật khẩu!" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(
                    new Error("Mật khẩu xác nhận không khớp!"),
                  );
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: "rgba(0,0,0,.25)" }} />}
              placeholder="Nhập lại mật khẩu"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
              style={{
                height: "46px",
                marginTop: "10px",
                fontSize: "16px",
                fontWeight: 600,
              }}
            >
              Xác nhận Kích hoạt Tài khoản
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: "center", marginTop: "16px" }}>
          <Text>Đã có tài khoản? </Text>
          <Link
            href="/login?type=student"
            style={{ color: "var(--school-primary)", fontWeight: 600 }}
          >
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    </div>
  );
}
