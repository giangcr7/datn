import React from 'react';
import ThemeRegistry from './ThemeRegistry';

export const metadata = {
  title: 'Hệ thống Xác thực Văn bằng Blockchain — Trường Đại học Thủy Lợi',
  description: 'Quản lý và xác thực văn bằng tốt nghiệp trên nền tảng Hyperledger Fabric — Trường Đại học Thủy Lợi',
  icons: {
    icon: '/logo-tlu.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#f0f2f5' }}>
        <ThemeRegistry>
          {children}
        </ThemeRegistry>
      </body>
    </html>
  );
}