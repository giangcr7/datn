// src/app/layout.tsx
import React from 'react';
// import './globals.css'; // Bỏ comment dòng này nếu bạn đã có file cấu hình Tailwind CSS

export const metadata = {
  title: 'Hệ thống Văn bằng ĐHTL',
  description: 'Quản lý văn bằng trên nền tảng Blockchain',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#f0f2f5' }}>
        {/* Next.js sẽ tự động "bơm" các layout con như (admin), (public) vào biến children này */}
        {children}
      </body>
    </html>
  );
}