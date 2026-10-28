"use client";

import React, { useState } from "react";
import {
  Layout,
  Menu,
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
import Image from "next/image";
import { UniversityBrand } from "@/components/UniversityChrome";
import styles from "@/styles/workspace.module.css";
import {
  canAccessWorkspacePath,
  getWorkspace,
  type WorkspaceUser,
} from "@/lib/workspace-access";

const { Header, Sider, Content } = Layout;
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
  const [mobile, setMobile] = useState(false);
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
    <Layout className={styles.shell}>
      <a className={styles.skipLink} href="#workspace-content">
        Chuyển đến nội dung chính
      </a>
      {mobile && !collapsed && (
        <button
          className={styles.scrim}
          aria-label="Đóng menu"
          onClick={() => setCollapsed(true)}
        />
      )}
      <Sider
        collapsed={collapsed}
        onCollapse={setCollapsed}
        onBreakpoint={setMobile}
        breakpoint="lg"
        collapsedWidth={mobile ? 0 : 72}
        width={272}
        className={styles.sidebar}
      >
        <Link
          href="/dashboard"
          className={styles.sidebarTitle}
          aria-label="Tổng quan quản lý văn bằng"
        >
          <Image
            src="/logo-tlu.png"
            alt="Đại học Thủy Lợi"
            width={36}
            height={36}
          />
          {!collapsed && <span>QUẢN LÝ VĂN BẰNG</span>}
        </Link>
        {!collapsed && (
          <div className={styles.scope}>
            <Tag color={workspace.color}>{workspace.roleLabel}</Tag>
            <p>{user.campusName || "Toàn hệ thống"}</p>
          </div>
        )}
        <Menu
          mode="inline"
          selectedKeys={[pathname]}
          defaultOpenKeys={["group:/diploma-records"]}
          items={menuItems}
          onClick={({ key }) => {
            router.push(key);
            if (mobile) setCollapsed(true);
          }}
          className={styles.menu}
        />
      </Sider>
      <Layout style={{ minWidth: 0 }}>
        <Header className={styles.header}>
          <div className={styles.identity}>
            <Button
              aria-label={collapsed ? "Mở menu" : "Thu gọn menu"}
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
            <UniversityBrand compact />
          </div>
          <Space size="middle" wrap>
            <Link
              href="/verify"
              target="_blank"
              className={styles.publicAction}
            >
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
                className={styles.account}
              >
                <Avatar
                  size="small"
                  style={{ background: "var(--school-primary)" }}
                  icon={<UserOutlined />}
                />
                <span>Tài khoản</span>
              </Button>
            </Dropdown>
          </Space>
        </Header>
        <Content
          id="workspace-content"
          tabIndex={-1}
          className={styles.content}
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
