"use client";

import { useEffect, type ReactNode } from "react";
import { Drawer } from "antd";
import styles from "./MobileNavigation.module.css";

export default function MobileNavigation({
  id,
  title,
  open,
  onClose,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 992px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) onClose();
    };
    desktop.addEventListener("change", closeOnDesktop);
    window.addEventListener("popstate", onClose);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      window.removeEventListener("popstate", onClose);
    };
  }, [open, onClose]);

  return (
    <Drawer
      title={title}
      placement="left"
      size="min(320px, 88vw)"
      open={open}
      onClose={onClose}
      rootClassName={styles.drawer}
      styles={{ body: { padding: 0 } }}
    >
      <nav id={id} aria-label={title} className={styles.links}>
        {children}
      </nav>
    </Drawer>
  );
}
