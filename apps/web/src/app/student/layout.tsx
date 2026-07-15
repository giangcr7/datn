'use client';

import React from 'react';
import { Layout, Menu } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { DashboardOutlined, LogoutOutlined, SafetyCertificateOutlined } from '@ant-design/icons';

const { Header, Content } = Layout;

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // 1. Cấu hình lại Menu dành riêng cho Sinh viên đã đăng nhập
  const menuItems = [
    { 
      key: '/student/dashboard', 
      icon: <DashboardOutlined />,
      label: 'Văn bằng của tôi' 
    },
    { 
      key: 'logout', 
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      danger: true // Nút màu đỏ cảnh báo
    }
  ];

  // 2. Xử lý điều hướng và Đăng xuất
  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === 'logout') {
      // Hủy phiên đăng nhập và đưa người dùng về trang chủ hoặc trang Login Sinh viên
      signOut({ callbackUrl: '/login?type=student' });
    } else {
      router.push(key);
    }
  };

  return (
    <Layout className="min-h-screen">
      {/* HEADER CHO SINH VIÊN */}
      <Header className="flex items-center bg-gray-900 px-6 shadow-md z-10">
        
        {/* Tên hệ thống phía Sinh viên */}
        <div className="text-white text-lg font-bold tracking-wide mr-auto flex items-center gap-2">
          <SafetyCertificateOutlined className="text-xl text-blue-400" />
          <span>CỔNG THÔNG TIN VĂN BẰNG SINH VIÊN</span>
        </div>

        {/* Menu Điều hướng */}
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          className="bg-transparent border-none min-w-[300px] justify-end"
        />
      </Header>

      {/* NỘI DUNG CHÍNH (Thay thế cho <Outlet />) */}
      <Content className="bg-gray-50">
        {children}
      </Content>
    </Layout>
  );
}