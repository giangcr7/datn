"use client";

import React from "react";
import { ConfigProvider } from "antd";
import viVN from "antd/locale/vi_VN";
import { SessionProvider } from "next-auth/react";
import { schoolTheme } from "@/lib/school-theme";

export default function ThemeRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <ConfigProvider locale={viVN} theme={schoolTheme}>
        {children}
      </ConfigProvider>
    </SessionProvider>
  );
}
