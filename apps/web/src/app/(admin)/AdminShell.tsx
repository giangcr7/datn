"use client";

import React, { useState } from "react";
import {
  Layout,
  Menu,
  Typography,
  Dropdown,
  Avatar,
  Tag,
  Button,
  Space,
  Modal,
  Result,
} from "antd";
import {
  DashboardOutlined,
  SafetyCertificateOutlined,
  FileAddOutlined,
  FileExcelOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  UserAddOutlined,
  SearchOutlined,
  LogoutOutlined,
  LockOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DeploymentUnitOutlined,
  FolderOpenOutlined,
  AppstoreOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import {
  canAccessWorkspacePath,
  getWorkspace,
  type WorkspaceUser,
} from "@/lib/workspace-access";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;
const navigationIcons: Record<string, React.ReactNode> = {
  "/diploma-records": <FolderOpenOutlined />,
  "/catalog": <AppstoreOutlined />,
  "/activity": <HistoryOutlined />,
  "/users": <UserOutlined />,
  "/explorer": <DeploymentUnitOutlined />,
  "/certificates": <SafetyCertificateOutlined />,
  "/pending": <CheckCircleOutlined />,
  "/students": <TeamOutlined />,
  "/students/import": <UserAddOutlined />,
  "/import": <FileExcelOutlined />,
  "/issue": <FileAddOutlined />,
};

export default function AdminShell({
  user,
  children,
}: {
  user: WorkspaceUser;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const workspace = getWorkspace(user);
  const menuItems = [
    {
      key: "/dashboard",
      icon: <DashboardOutlined />,
      label: "Tổng quan",
    },
    ...workspace.links.map((link) => ({
      key: link.path,
      icon: navigationIcons[link.path],
      label: link.label,
      ...(link.children
        ? {
            children: [
              { key: link.path, label: "Tổng hợp hồ sơ" },
              ...link.children.map((child) => ({
                key: child.path,
                icon: navigationIcons[child.path],
                label: child.label,
              })),
            ],
            key: "group:" + link.path,
          }
        : {}),
    })),
  ];
  const userMenuItems = [
    {
      key: "password",
      icon: <LockOutlined />,
      label: "Đổi mật khẩu",
      onClick: () => router.push("/change-password"),
    },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Đăng xuất",
      danger: true,
      onClick: () =>
        Modal.confirm({
          title: "Xác nhận đăng xuất",
          content: "Bạn muốn đăng xuất khỏi không gian làm việc?",
          okText: "Đăng xuất",
          cancelText: "Hủy",
          onOk: () => signOut({ callbackUrl: "/login" }),
        }),
    },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={72}
        width={272}
        style={{
          background: "#001a38",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
          zIndex: 100,
        }}
      >
        <Link
          href="/dashboard"
          style={{
            height: 80,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: collapsed ? 16 : 20,
            borderBottom: "1px solid #ffffff1f",
          }}
        >
          <img
            src="/logo-tlu.png"
            alt="Đại học Thủy Lợi"
            style={{
              width: 40,
              height: 40,
              padding: 3,
              background: "#fff",
              borderRadius: "50%",
            }}
          />
          {!collapsed && (
            <div style={{ lineHeight: 1.5 }}>
              <Text strong style={{ color: "#fff", fontSize: 15 }}>
                DIPLOMACHAIN
              </Text>
              <div style={{ color: "#91caff", fontSize: 11 }}>
                ĐẠI HỌC THỦY LỢI
              </div>
            </div>
          )}
        </Link>
        {!collapsed && (
          <div
            style={{
              margin: "20px 16px 12px",
              padding: 14,
              borderRadius: 10,
              background: "#ffffff0d",
              border: "1px solid #ffffff1a",
            }}
          >
            <Tag color={workspace.color} style={{ marginBottom: 8 }}>
              {workspace.roleLabel}
            </Tag>
            <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
              {user.campusName || "Toàn hệ thống"}
            </div>
          </div>
        )}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          defaultOpenKeys={["group:/diploma-records"]}
          items={menuItems}
          onClick={({ key }) => router.push(key)}
          style={{
            background: "transparent",
            marginTop: 12,
            borderInlineEnd: 0,
          }}
        />
      </Sider>
      <Layout style={{ minWidth: 0 }}>
        <Header
          style={{
            background: "#fff",
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            position: "sticky",
            top: 0,
            zIndex: 90,
            borderBottom: "1px solid #e5eaf0",
          }}
        >
          <Space>
            <Button
              aria-label={collapsed ? "Mở menu" : "Thu gọn menu"}
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
          </Space>
          <Space size="middle">
            <Link href="/verify" target="_blank" className="hidden md:inline">
              <Button
                aria-label="Xác thực công khai"
                title="Xác thực công khai"
                icon={<SearchOutlined />}
              >
                Xác thực
              </Button>
            </Link>
            <Dropdown menu={{ items: userMenuItems }} trigger={["click"]}>
              <Button
                aria-label={user.name || user.email || "Người dùng"}
                title={user.name || user.email || "Người dùng"}
                type="text"
                style={{ height: "auto", padding: "6px 8px" }}
              >
                <Avatar
                  size="small"
                  style={{ background: workspace.color }}
                  icon={<UserOutlined />}
                />
                <span>Tài khoản</span>
              </Button>
            </Dropdown>
          </Space>
        </Header>
        <Content
          style={{ background: "#f3f6fa", minHeight: "calc(100vh - 64px)" }}
        >
          {canAccessWorkspacePath(user, pathname) ? (
            children
          ) : (
            <Result
              status="403"
              title="Màn hình không thuộc vai trò của bạn"
              subTitle="Hãy chọn chức năng trong menu công việc của tài khoản."
              extra={
                <Button
                  type="primary"
                  onClick={() => router.push("/dashboard")}
                >
                  Về tổng quan
                </Button>
              }
            />
          )}
        </Content>
      </Layout>
    </Layout>
  );
}
