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
        if (values.role === 'university') {
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
      minHeight: '85vh', 
      background: '#f0f2f5',
      padding: '20px' 
    }}>
      <Card 
        style={{ 
          width: '100%', 
          maxWidth: '450px', 
          borderRadius: '8px', 
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)' 
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <Title level={4} type="secondary">VUI LÒNG ĐĂNG NHẬP ĐỂ TIẾP TỤC HỆ THỐNG</Title>
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