"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { HomeOutlined, LoginOutlined, MenuOutlined } from "@ant-design/icons";
import MobileNavigation from "./MobileNavigation";
import styles from "@/styles/university-portal.module.css";

type PublicSection = "home" | "search" | "verify" | "account";

export function UniversityBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      className={styles.brand + (compact ? " " + styles.brandCompact : "")}
      href="/"
      aria-label="Trang chủ Đại học Thủy Lợi"
    >
      <Image
        src="/logo-tlu.png"
        alt="Logo Trường Đại học Thủy Lợi"
        width={compact ? 42 : 70}
        height={compact ? 42 : 70}
        priority
      />
      <span className={styles.brandText}>
        <strong>TRƯỜNG ĐẠI HỌC THỦY LỢI</strong>
      </span>
    </Link>
  );
}

export function UniversityMasthead() {
  return (
    <div className={styles.container + " " + styles.headerInner}>
      <UniversityBrand />
    </div>
  );
}

export function UniversityHeader({
  active = "home",
}: {
  active?: PublicSection;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const publicLinks = [
    { href: "/", label: "Trang chủ", section: "home" },
    { href: "/search", label: "Tra cứu văn bằng", section: "search" },
    {
      href: active === "home" ? "#huong-dan" : "/#huong-dan",
      label: "Hướng dẫn sử dụng",
      section: "guide",
    },
    { href: "/login", label: "Đăng nhập", section: "account" },
  ];
  return (
    <header className={styles.header}>
      <UniversityMasthead />
      <nav className={styles.navigation} aria-label="Điều hướng chính">
        <div className={styles.container + " " + styles.navigationInner}>
          <Link
            className={styles.homeLink}
            href="/"
            aria-current={active === "home" ? "page" : undefined}
          >
            <HomeOutlined aria-hidden="true" />
            Trang chủ
          </Link>
          <Link
            href="/search"
            aria-label="Tra cứu văn bằng"
            aria-current={active === "search" ? "page" : undefined}
          >
            Tra cứu<span className={styles.navigationDetail}> văn bằng</span>
          </Link>
          <Link href={active === "home" ? "#huong-dan" : "/#huong-dan"}>
            Hướng dẫn
          </Link>
          <Link
            className={styles.loginLink}
            href="/login"
            aria-current={active === "account" ? "page" : undefined}
          >
            <LoginOutlined aria-hidden="true" />
            Đăng nhập
          </Link>
        </div>
        <div className={styles.container + " " + styles.mobileNavigationBar}>
          <button
            type="button"
            className={styles.navigationToggle}
            aria-label="Mở menu chính"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls="public-mobile-navigation"
            onClick={() => setMenuOpen(true)}
          >
            <MenuOutlined aria-hidden="true" />
            Menu
          </button>
          <Link
            href="/login"
            className={styles.mobileLogin}
            aria-current={active === "account" ? "page" : undefined}
          >
            <LoginOutlined aria-hidden="true" />
            Đăng nhập
          </Link>
        </div>
      </nav>
      <MobileNavigation
        id="public-mobile-navigation"
        title="Menu chính"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      >
        {publicLinks.map((link) => (
          <Link
            key={link.section}
            href={link.href}
            aria-current={active === link.section ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            {link.label}
          </Link>
        ))}
      </MobileNavigation>
    </header>
  );
}

export function UniversityFooter({ home = false }: { home?: boolean }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.container + " " + styles.footerInner}>
        <div>
          <strong>TRƯỜNG ĐẠI HỌC THỦY LỢI</strong>
          <p className={styles.technologyNote}>
            Ứng dụng blockchain trong quản lý và xác thực văn bằng.
          </p>
        </div>
        <nav aria-label="Liên kết cuối trang">
          <Link href={home ? "#huong-dan" : "/#huong-dan"}>
            Hướng dẫn sử dụng
          </Link>
        </nav>
      </div>
    </footer>
  );
}
