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
      <Header
        style={{
          background: 'linear-gradient(135deg, #001a38 0%, #003b93 100%)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          boxShadow: '0 2px 8px rgba(0, 33, 64, 0.2)',
          zIndex: 10,
        }}
      >
        {/* Tên hệ thống phía Sinh viên */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 'auto' }}>
          <img
            src="/logo-tlu.png"
            alt="Đại học Thủy Lợi"
            style={{
              width: 38,
              height: 38,
              objectFit: 'contain',
              background: '#fff',
              borderRadius: '50%',
              padding: 2,
            }}
          />
          <div>
            <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, lineHeight: 1.2 }}>
              TRƯỜNG ĐẠI HỌC THỦY LỢI
            </div>
            <div style={{ color: '#91caff', fontSize: 11, fontWeight: 500 }}>
              CỔNG THÔNG TIN VĂN BẰNG SINH VIÊN
            </div>
          </div>
        </div>

        {/* Menu Điều hướng */}
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ background: 'transparent', borderBottom: 0, minWidth: 300, justifyContent: 'flex-end' }}
        />
      </Header>

      {/* NỘI DUNG CHÍNH (Thay thế cho <Outlet />) */}
      <Content className="bg-gray-50">
        {children}
      </Content>
    </Layout>
  );
}