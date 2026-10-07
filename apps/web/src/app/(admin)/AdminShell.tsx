'use client';

import React, { useState } from 'react';
import { Layout, Menu, Typography, Dropdown, Avatar, Tag, Button, Space, Modal } from 'antd';
import {
  DashboardOutlined,
  SafetyCertificateOutlined,
  FileAddOutlined,
  FileExcelOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  UserAddOutlined,
  SettingOutlined,
  SearchOutlined,
  LogoutOutlined,
  LockOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BankOutlined,
  DeploymentUnitOutlined,
} from '@ant-design/icons';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import Link from 'next/link';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

interface AdminShellProps {
  user: {
    name?: string;
    email?: string;
    role?: string;
  };
  children: React.ReactNode;
}

export default function AdminShell({ user, children }: AdminShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    Modal.confirm({
      title: 'Xác nhận đăng xuất',
      content: 'Bạn có chắc chắn muốn đăng xuất khỏi hệ thống quản trị?',
      okText: 'Đăng xuất',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: () => {
        signOut({ callbackUrl: '/login' });
      },
    });
  };

  const userMenuItems = [
    {
      key: 'change-password',
      icon: <LockOutlined />,
      label: 'Đổi mật khẩu',
      onClick: () => router.push('/change-password'),
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      danger: true,
      onClick: handleLogout,
    },
  ];

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Tổng quan (Dashboard)',
    },
    {
      key: '/explorer',
      icon: <DeploymentUnitOutlined />,
      label: 'Khám phá Blockchain (Explorer)',
    },
    {
      key: 'sub-certs',
      icon: <SafetyCertificateOutlined />,
      label: 'Quản lý văn bằng',
      children: [
        {
          key: '/certificates',
          icon: <SafetyCertificateOutlined />,
          label: 'Danh sách văn bằng',
        },
        {
          key: '/issue',
          icon: <FileAddOutlined />,
          label: 'Cấp văn bằng mới',
        },
        {
          key: '/import',
          icon: <FileExcelOutlined />,
          label: 'Import văn bằng (Excel)',
        },
        {
          key: '/pending',
          icon: <CheckCircleOutlined />,
          label: 'Duyệt văn bằng (2 cơ sở)',
        },
      ],
    },
    {
      key: 'sub-students',
      icon: <TeamOutlined />,
      label: 'Quản lý sinh viên',
      children: [
        {
          key: '/students',
          icon: <TeamOutlined />,
          label: 'Danh sách sinh viên',
        },
        {
          key: '/students/import',
          icon: <UserAddOutlined />,
          label: 'Import sinh viên (Excel)',
        },
      ],
    },
    {
      key: 'sub-system',
      icon: <SettingOutlined />,
      label: 'Quản trị hệ thống',
      children: [
        {
          key: '/users',
          icon: <UserOutlined />,
          label: 'Tài khoản & Phân quyền',
        },
      ],
    },
    {
      key: '/verify',
      icon: <SearchOutlined />,
      label: 'Tra cứu công khai',
    },
  ];

  // Xác định submenu mở mặc định dựa trên pathname
  const getOpenKeys = () => {
    if (['/certificates', '/issue', '/import', '/pending'].includes(pathname)) {
      return ['sub-certs'];
    }
    if (['/students', '/students/import'].includes(pathname)) {
      return ['sub-students'];
    }
    if (['/users'].includes(pathname)) {
      return ['sub-system'];
    }
    return [];
  };

  const roleName = user.role?.toUpperCase() === 'ADMIN' ? 'QUẢN TRỊ VIÊN' : 'CÁN BỘ NHÀ TRƯỜNG';
  const roleColor = user.role?.toUpperCase() === 'ADMIN' ? 'blue' : 'green';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* SIDEBAR NAVIGATION */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={(val) => setCollapsed(val)}
        width={260}
        theme="dark"
        style={{
          background: '#001a38',
          boxShadow: '2px 0 8px 0 rgba(0, 33, 64, 0.15)',
          position: 'sticky',
          top: 0,
          left: 0,
          height: '100vh',
          zIndex: 100,
        }}
      >
        {/* LOGO & BRAND */}
        <div
          style={{
            height: 68,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0' : '0 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
            overflow: 'hidden',
          }}
        >
          <img
            src="/logo-tlu.png"
            alt="Đại học Thủy Lợi"
            style={{
              width: 40,
              height: 40,
              objectFit: 'contain',
              marginRight: collapsed ? 0 : 12,
              background: '#fff',
              borderRadius: '50%',
              padding: 2,
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          />
          {!collapsed && (
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 15, letterSpacing: 0.5 }}>
                ĐẠI HỌC THỦY LỢI
              </div>
              <div style={{ color: '#91caff', fontSize: 11, fontWeight: 500 }}>HỆ THỐNG VĂN BẰNG SỐ</div>
            </div>
          )}
        </div>

        {/* MENU ITEMS */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          defaultOpenKeys={getOpenKeys()}
          items={menuItems}
          onClick={({ key }) => {
            if (key.startsWith('/')) {
              router.push(key);
            }
          }}
          style={{ marginTop: 12, borderRight: 0, background: '#001a38' }}
        />
      </Sider>

      {/* MAIN CONTAINER */}
      <Layout>
        {/* TOP HEADER */}
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0,33,64,0.06)',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            borderBottom: '2px solid #e6f0ff',
          }}
        >
          {/* Toggle Sider Button */}
          <Space>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 18, width: 40, height: 40, color: '#003b93' }}
            />
            <Text strong style={{ fontSize: 16, color: '#002140' }}>
              Trường Đại học Thủy Lợi — Hệ thống Xác thực Văn bằng Blockchain
            </Text>
          </Space>

          {/* Right actions: Verify link & User Dropdown */}
          <Space size="large">
            <Link href="/verify" target="_blank">
              <Button type="default" icon={<SearchOutlined />} size="middle">
                Cổng Tra cứu Công khai
              </Button>
            </Link>

            <Dropdown menu={{ items: userMenuItems }} trigger={['click']}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 6,
                  transition: 'background 0.2s',
                }}
              >
                <Avatar
                  style={{ backgroundColor: user.role === 'admin' ? '#1890ff' : '#52c41a', marginRight: 10 }}
                  icon={<UserOutlined />}
                />
                <div style={{ textAlign: 'left', lineHeight: 1.3 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#333' }}>
                    {user.name || 'Người dùng'}
                  </div>
                  <div>
                    <Tag color={roleColor} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}>
                      {roleName}
                    </Tag>
                  </div>
                </div>
              </div>
            </Dropdown>
          </Space>
        </Header>

        {/* CONTENT AREA */}
        <Content style={{ background: '#f5f7fa', minHeight: 'calc(100vh - 64px)' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
