import React from "react";
import ThemeRegistry from "./ThemeRegistry";
import { schoolColors } from "@/lib/school-theme";
import "./globals.css";

export const metadata = {
  title: "Hệ thống Xác thực Văn bằng Blockchain — Trường Đại học Thủy Lợi",
  description:
    "Quản lý và xác thực văn bằng tốt nghiệp trên nền tảng Hyperledger Fabric — Trường Đại học Thủy Lợi",
  icons: {
    icon: "/logo-tlu.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      style={
        Object.fromEntries(
          Object.entries(schoolColors).map(([name, value]) => [
            "--school-" + name,
            value,
          ]),
        ) as React.CSSProperties
      }
    >
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
