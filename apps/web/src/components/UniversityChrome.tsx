"use client";

import Image from "next/image";
import Link from "next/link";
import { HomeOutlined, LoginOutlined } from "@ant-design/icons";
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
          <Link
            href="/verify"
            aria-label="Xác thực văn bằng"
            aria-current={active === "verify" ? "page" : undefined}
          >
            Xác thực<span className={styles.navigationDetail}> văn bằng</span>
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
      </nav>
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
          <a href="#dau-trang">Về đầu trang ↑</a>
        </nav>
      </div>
    </footer>
  );
}
