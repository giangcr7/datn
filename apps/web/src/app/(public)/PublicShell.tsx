"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  UniversityFooter,
  UniversityHeader,
} from "@/components/UniversityChrome";
import styles from "@/styles/university-portal.module.css";

export default function PublicShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active =
    pathname === "/search"
      ? "search"
      : pathname === "/verify"
        ? "verify"
        : "account";
  return (
    <div className={styles.page + " " + styles.publicPage} id="dau-trang">
      <a className={styles.skipLink} href="#noi-dung">
        Chuyển đến nội dung chính
      </a>
      <UniversityHeader active={active} />
      <main id="noi-dung" tabIndex={-1} className={styles.publicContent}>
        {children}
      </main>
      <UniversityFooter />
    </div>
  );
}
