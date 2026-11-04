"use client";

import React, { useState } from "react";
import { Button, Layout, Menu } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  UniversityMasthead,
  UniversityFooter,
} from "@/components/UniversityChrome";
import styles from "@/styles/workspace.module.css";
import NotificationBell from "@/components/NotificationBell";
import MobileNavigation from "@/components/MobileNavigation";
import portalStyles from "@/styles/university-portal.module.css";
import {
  DashboardOutlined,
  LogoutOutlined,
  UserOutlined,
  SearchOutlined,
  FormOutlined,
  MenuOutlined,
} from "@ant-design/icons";

const { Content } = Layout;

export default function StudentShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

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
      key: "/student/requests",
      icon: <FormOutlined />,
      label: "Yêu cầu chỉnh sửa",
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
    setMenuOpen(false);
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
          <div className={styles.studentNavInner}>
            <Button
              type="text"
              className={styles.studentMobileToggle}
              icon={<MenuOutlined />}
              aria-label="Mở menu sinh viên"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              aria-controls="student-mobile-navigation"
              onClick={() => setMenuOpen(true)}
            >
              Menu sinh viên
            </Button>
            <Menu
              theme="dark"
              mode="horizontal"
              selectedKeys={[pathname]}
              items={menuItems}
              onClick={handleMenuClick}
              className={styles.studentMenu}
            />
            <NotificationBell inverse />
          </div>
        </nav>
      </header>
      <MobileNavigation
        id="student-mobile-navigation"
        title="Menu sinh viên"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      >
        <Menu
          mode="inline"
          selectedKeys={[pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </MobileNavigation>
      <Content id="student-content" tabIndex={-1} className={styles.content}>
        {children}
      </Content>
      <UniversityFooter />
    </Layout>
  );
}
