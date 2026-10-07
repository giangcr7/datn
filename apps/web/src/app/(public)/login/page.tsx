'use client';

import React, { useState, Suspense } from 'react';
import { Card, Form, Input, Button, Typography, Tabs, Checkbox, message } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined } from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';

const { Title, Text } = Typography;

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Đọc tham số từ URL (ví dụ: /login?type=university)
  const defaultTab = searchParams.get('type') || 'student';
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const res = await signIn('credentials', {
        redirect: false, 
        email: values.email,
        password: values.password,
        role: values.role.toUpperCase(), // Map 'STUDENT' hoặc 'UNIVERSITY'
      });

      if (res?.error) {
        message.error(res.error);
      } else {
        message.success('Đăng nhập thành công!');
        if (values.role === 'university' || values.role === 'admin') {
          router.push('/dashboard'); 
        } else {
          router.push('/student/dashboard'); 
        }
        router.refresh();
      }
    } catch (error) {
      message.error('Lỗi kết nối máy chủ. Vui lòng thử lại!');
    } finally {
      setLoading(false);
    }
  };

  const renderLoginForm = (role: string) => (
    <Form
      layout="vertical"
      initialValues={{ role, remember: true }}
      onFinish={onFinish}
      style={{ marginTop: '20px' }}
    >
      <Form.Item name="role" hidden>
        <Input />
      </Form.Item>

      <Form.Item
        name="email"
        rules={[{ required: true, type: 'email', message: 'Vui lòng nhập Email hợp lệ!' }]}
      >
        <Input 
          prefix={<UserOutlined style={{ color: 'rgba(0,0,0,.25)' }} />} 
          placeholder={role === 'university' ? "Email cán bộ (@tlu.edu.vn)" : "Email sinh viên"} 
          size="large"
        />
      </Form.Item>

      <Form.Item
        name="password"
        rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}
      >
        <Input.Password
          prefix={<LockOutlined style={{ color: 'rgba(0,0,0,.25)' }} />}
          placeholder="Mật khẩu"
          size="large"
        />
      </Form.Item>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <Checkbox>Ghi nhớ</Checkbox>
        <Link href="/forgot-password" style={{ color: '#1890ff' }}>Quên mật khẩu?</Link>
      </div>

      <Form.Item>
        <Button 
          type="primary" 
          htmlType="submit" 
          block 
          size="large" 
          icon={<LoginOutlined />}
          style={{ height: '45px' }}
          loading={loading}
        >
          Đăng nhập
        </Button>
      </Form.Item>
    </Form>
  );

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '90vh', 
      background: 'linear-gradient(135deg, #f0f5ff 0%, #e6f0ff 100%)',
      padding: '24px 16px' 
    }}>
      <Card 
        style={{ 
          width: '100%', 
          maxWidth: '460px', 
          borderRadius: '12px', 
          boxShadow: '0 8px 24px rgba(0, 59, 147, 0.12)',
          borderTop: '4px solid #003b93',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img
            src="/logo-tlu.png"
            alt="Logo Trường Đại học Thủy Lợi"
            style={{
              width: 80,
              height: 80,
              objectFit: 'contain',
              marginBottom: 12,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
            }}
          />
          <Title level={4} style={{ color: '#002140', margin: '0 0 4px', fontWeight: 'bold' }}>
            TRƯỜNG ĐẠI HỌC THỦY LỢI
          </Title>
          <Text style={{ color: '#003b93', fontSize: 13, fontWeight: 600, display: 'block' }}>
            HỆ THỐNG QUẢN LÝ & XÁC THỰC VĂN BẰNG BLOCKCHAIN
          </Text>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key)}
          centered
          items={[
            {
              key: 'student',
              label: 'Sinh viên',
              children: renderLoginForm('student'),
            },
            {
              key: 'university',
              label: 'Nhà trường',
              children: renderLoginForm('university'),
            },
            {
              key: 'admin',
              label: 'Quản trị viên',
              children: renderLoginForm('admin'),
            },
          ]}
        />

        {/* LOGIC HIỂN THỊ CÓ ĐIỀU KIỆN (CONDITIONAL RENDERING) */}
        {activeTab === 'student' ? (
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <Text>Bạn chưa kích hoạt tài khoản? </Text>
            <Link 
              href="/register/student" // Đã trỏ chuẩn về thư mục thiết kế
              style={{ color: '#1890ff', fontWeight: 500 }}
            >
              Kích hoạt ngay
            </Link>
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <Text type="secondary" style={{ fontStyle: 'italic', fontSize: '13px' }}>
              Tài khoản Cán bộ do Ban Quản trị hệ thống khởi tạo và cấp phát.
            </Text>
          </div>
        )}

      </Card>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-screen">Đang tải...</div>}>
      <LoginContent />
    </Suspense>
  );
}