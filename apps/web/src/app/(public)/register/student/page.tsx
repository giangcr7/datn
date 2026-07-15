'use client';

import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { LockOutlined, IdcardOutlined, MailOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const { Title, Text } = Typography;

export default function StudentRegister() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mssv: values.mssv,
          email: values.email,
          password: values.password,
          role: 'STUDENT', // Mặc định role là STUDENT khi gọi từ trang này
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        message.success(data.message);
        // Chuyển hướng về trang đăng nhập và tự động mở tab Sinh viên
        router.push('/login?type=student'); 
      } else {
        message.error(data.error || 'Đăng ký thất bại!');
      }
    } catch (error) {
      message.error('Lỗi kết nối máy chủ. Vui lòng thử lại sau!');
    } finally {
      setLoading(false);
    }
  };

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
          <Title level={3} style={{ color: '#1890ff', margin: 0 }}>KÍCH HOẠT TÀI KHOẢN</Title>
          <Text type="secondary">Dành cho Sinh viên Trường Đại học Thủy lợi</Text>
        </div>

        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="mssv"
            rules={[{ required: true, message: 'Vui lòng nhập Mã số sinh viên!' }]}
          >
            <Input 
              prefix={<IdcardOutlined style={{ color: 'rgba(0,0,0,.25)' }} />} 
              placeholder="Mã số sinh viên (Ví dụ: 2251011111)" 
              size="large" 
            />
          </Form.Item>

          <Form.Item
            name="email"
            rules={[
              { required: true, type: 'email', message: 'Vui lòng nhập Email hợp lệ!' },
              { 
                pattern: /@student\.tlu\.edu\.vn$/, 
                message: 'Bạn phải sử dụng email đuôi @student.tlu.edu.vn' 
              }
            ]}
          >
            <Input 
              prefix={<MailOutlined style={{ color: 'rgba(0,0,0,.25)' }} />} 
              placeholder="Email sinh viên (MSSV@student.tlu.edu.vn)" 
              size="large" 
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự!' }]}
          >
            <Input.Password 
              prefix={<LockOutlined style={{ color: 'rgba(0,0,0,.25)' }} />} 
              placeholder="Tạo mật khẩu mới" 
              size="large" 
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Vui lòng xác nhận mật khẩu!' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
                },
              }),
            ]}
          >
            <Input.Password 
              prefix={<LockOutlined style={{ color: 'rgba(0,0,0,.25)' }} />} 
              placeholder="Xác nhận mật khẩu" 
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
              style={{ height: '45px', marginTop: '10px' }}
            >
              Xác nhận Kích hoạt
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <Text>Đã có tài khoản? </Text>
          <Link href="/login?type=student" style={{ color: '#1890ff', fontWeight: 500 }}>
            Đăng nhập ngay
          </Link>
        </div>
      </Card>
    </div>
  );
}