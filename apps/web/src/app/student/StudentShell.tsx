"use client";

import React from "react";
import { Layout, Menu } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  UniversityMasthead,
  UniversityFooter,
} from "@/components/UniversityChrome";
import styles from "@/styles/workspace.module.css";
import portalStyles from "@/styles/university-portal.module.css";
import {
  DashboardOutlined,
  LogoutOutlined,
  UserOutlined,
  SearchOutlined,
} from "@ant-design/icons";

const { Content } = Layout;

export default function StudentShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // 1. Cấu hình lại Menu dành riêng cho Sinh viên đã đăng nhập
  const menuItems = [
    {
      key: "/student/dashboard",
      icon: <DashboardOutlined />,
      label: "Văn bằng của tôi",
    },
    {
      key: "/student/profile",
      icon: <UserOutlined />,
      label: "Hồ sơ của tôi",
    },
    {
      key: "/verify",
      icon: <SearchOutlined />,
      label: "Xác thực văn bằng",
    },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Đăng xuất",
      danger: true, // Nút màu đỏ cảnh báo
    },
  ];

  // 2. Xử lý điều hướng và Đăng xuất
  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === "logout") {
      // Hủy phiên đăng nhập và đưa người dùng về trang chủ hoặc trang Login Sinh viên
      signOut({ callbackUrl: "/login?type=student" });
    } else {
      router.push(key);
    }
  };

  return (
    <Layout className={styles.shell + " " + portalStyles.page} id="dau-trang">
      <a className={styles.skipLink} href="#student-content">
        Chuyển đến nội dung chính
      </a>
      <header className={styles.studentHeader}>
        <UniversityMasthead />
        <nav className={styles.studentNav} aria-label="Điều hướng sinh viên">
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[pathname]}
            items={menuItems}
            onClick={handleMenuClick}
            className={styles.studentMenu}
          />
        </nav>
      </header>
      <Content id="student-content" tabIndex={-1} className={styles.content}>
        {children}
      </Content>
      <UniversityFooter />
    </Layout>
  );
}
