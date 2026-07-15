'use client';

import React, { useState } from 'react';
import { Card, Input, Button, Typography, Row, Col, message } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const { Title, Text } = Typography;

// ================= 1. KHAI BÁO SCHEMA KIỂM ĐỊNH ZOD =================
// Đảm bảo dữ liệu sinh viên luôn sạch và chuẩn form trước khi đẩy xuống Database
const registerSchema = z.object({
  name: z.string().min(3, 'Họ và tên phải có ít nhất 3 ký tự').max(50, 'Họ tên quá dài'),
  email: z.string().email('Email không đúng định dạng'),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterStudentPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Khởi tạo react-hook-form
  const { control, handleSubmit, formState: { errors } } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  // ================= 2. XỬ LÝ GỌI API ĐĂNG KÝ =================
  const onSubmit = async (data: RegisterFormValues) => {
    setLoading(true);
    try {
      // Gọi tới API Route của Next.js (bạn cần tạo file src/app/api/auth/register/route.ts)
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          role: 'STUDENT', // Cố định role cho trang này
        }),
      });

      const result = await response.json();

      if (response.ok) {
        message.success(result.message || 'Đăng ký tài khoản thành công!');
        // Chuyển hướng sang trang đăng nhập và tự động mở tab Sinh viên
        router.push('/login?type=student');
      } else {
        message.error(result.error || 'Đăng ký thất bại. Email có thể đã tồn tại!');
      }
    } catch (error) {
      message.error('Mất kết nối tới máy chủ. Vui lòng thử lại!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center py-16 px-4">
      <div className="w-full max-w-xl">
        <Card className="rounded-lg shadow-sm border-gray-200">
          <Title level={4} className="text-center font-normal mb-8 text-gray-700">
            ĐĂNG KÝ TÀI KHOẢN SINH VIÊN
          </Title>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Row gutter={16}>
              <Col span={12}>
                <div className="mb-4">
                  <Text strong>Họ và tên <span className="text-red-500">*</span></Text>
                  <Controller
                    name="name"
                    control={control}
                    render={({ field }) => (
                      <Input {...field} size="large" placeholder="Lê Hoàng Giang" status={errors.name ? 'error' : ''} />
                    )}
                  />
                  {errors.name && <Text type="danger" className="text-sm">{errors.name.message}</Text>}
                </div>
              </Col>
              
              <Col span={12}>
                <div className="mb-4">
                  <Text strong>Email <span className="text-red-500">*</span></Text>
                  <Controller
                    name="email"
                    control={control}
                    render={({ field }) => (
                      <Input {...field} size="large" placeholder="giang@student.com" status={errors.email ? 'error' : ''} />
                    )}
                  />
                  {errors.email && <Text type="danger" className="text-sm">{errors.email.message}</Text>}
                </div>
              </Col>
            </Row>

            <div className="mb-6">
              <Text strong>Tạo mật khẩu <span className="text-red-500">*</span></Text>
              <Controller
                name="password"
                control={control}
                render={({ field }) => (
                  <Input.Password {...field} size="large" placeholder="••••••" status={errors.password ? 'error' : ''} />
                )}
              />
              {errors.password && <Text type="danger" className="text-sm">{errors.password.message}</Text>}
            </div>

            <Button 
              type="primary" 
              htmlType="submit" 
              block 
              size="large" 
              loading={loading}
              className="bg-blue-600 hover:bg-blue-700 h-11"
            >
              Đăng ký ngay
            </Button>

            <div className="text-center text-xs text-gray-500 mt-4">
              Khi nhấn “Đăng ký”, bạn đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư của hệ thống.
            </div>
          </form>
        </Card>

        <div className="text-center mt-6">
          <Text>Đã có tài khoản? </Text>
          <Link href="/login?type=student" className="text-blue-600 font-medium hover:underline">
            Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}