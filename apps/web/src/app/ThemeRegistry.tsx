'use client';

import React from 'react';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={viVN}
      theme={{
        token: {
          colorPrimary: '#003b93', // Màu xanh thương hiệu Đại học Thủy Lợi (TLU Royal Blue)
          colorLink: '#003b93',
          colorLinkHover: '#0056b3',
          colorSuccess: '#52c41a',
          colorWarning: '#faad14',
          colorError: '#ff4d4f',
          colorInfo: '#003b93',
          borderRadius: 8,
          fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        },
        components: {
          Button: {
            colorPrimary: '#003b93',
            colorPrimaryHover: '#0056b3',
            colorPrimaryActive: '#002766',
            borderRadius: 6,
          },
          Card: {
            borderRadiusLG: 10,
          },
          Table: {
            headerBg: '#f4f7fb',
            headerColor: '#002140',
            rowHoverBg: '#f0f5ff',
          },
          Tabs: {
            itemSelectedColor: '#003b93',
            inkBarColor: '#003b93',
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
