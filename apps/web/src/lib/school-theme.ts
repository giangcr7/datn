import type { ThemeConfig } from "antd";

export const schoolColors = {
  primary: "#003b93",
  navy: "#163459",
  ink: "#25384c",
  muted: "#59697a",
  border: "#d9e0e8",
  gold: "#bc9850",
  background: "#f5f7fa",
};

export const schoolTheme: ThemeConfig = {
  token: {
    colorPrimary: schoolColors.primary,
    colorInfo: schoolColors.primary,
    colorLink: schoolColors.primary,
    colorLinkHover: "#0056b3",
    colorText: schoolColors.ink,
    colorTextHeading: schoolColors.navy,
    colorTextSecondary: schoolColors.muted,
    colorBorder: schoolColors.border,
    colorBorderSecondary: schoolColors.border,
    colorBgLayout: schoolColors.background,
    borderRadius: 3,
    borderRadiusLG: 4,
    controlHeight: 36,
    controlHeightLG: 44,
    fontFamily: 'var(--font-roboto), "Roboto", sans-serif',
  },
  components: {
    Button: {
      primaryShadow: "none",
      defaultShadow: "none",
      dangerShadow: "none",
      fontWeight: 600,
    },
    Card: { headerBg: "#ffffff" },
    Table: {
      headerBg: "#eef3f8",
      headerColor: schoolColors.navy,
      rowHoverBg: "#f2f6fb",
    },
    Tabs: {
      itemSelectedColor: schoolColors.primary,
      inkBarColor: schoolColors.primary,
      titleFontSize: 14,
    },
    Menu: {
      itemBorderRadius: 3,
      itemColor: schoolColors.ink,
      itemSelectedBg: "#eaf0f8",
      itemSelectedColor: schoolColors.primary,
      darkItemBg: schoolColors.primary,
      darkSubMenuItemBg: schoolColors.primary,
      darkItemSelectedBg: "#002d70",
      darkItemHoverBg: "#002d70",
    },
    Layout: {
      bodyBg: schoolColors.background,
      headerBg: "#ffffff",
      siderBg: "#ffffff",
    },
  },
};
