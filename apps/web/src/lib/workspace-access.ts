export interface WorkspaceUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  role?: string;
  org?: string;
  campusName?: string;
  isHeadquarters?: boolean;
  canApproveDiplomas?: boolean;
  mustChangePassword?: boolean;
}

export type WorkspaceKind = "admin" | "approver" | "student" | "none";

export interface WorkspaceLink {
  path: string;
  label: string;
  description: string;
  children?: WorkspaceLink[];
}

export function getWorkspaceKind(user?: WorkspaceUser | null): WorkspaceKind {
  const role = user?.role?.toLowerCase();
  if (role === "admin") return "admin";
  if (role === "student") return "student";
  if (role !== "university") return "none";
  return user?.isHeadquarters && user.canApproveDiplomas ? "approver" : "none";
}

export function getWorkspace(user?: WorkspaceUser | null): {
  kind: WorkspaceKind;
  title: string;
  roleLabel: string;
  color: string;
  scope: string;
  description: string;
  links: WorkspaceLink[];
} {
  const kind = getWorkspaceKind(user);
  if (kind === "admin") {
    return {
      kind,
      title: "Trung tâm quản trị hệ thống",
      roleLabel: "QUẢN TRỊ HỆ THỐNG",
      color: "#722ed1",
      scope: "Giám sát toàn trường · Không xử lý nghiệp vụ cấp bằng",
      description:
        "Quản lý tài khoản, xem dữ liệu và giám sát giao dịch. Admin không lập hồ sơ, phê duyệt hoặc thu hồi thay nhà trường.",
      links: [
        {
          path: "/users",
          label: "Tài khoản & phân quyền",
          description: "Xem tài khoản, vai trò và trạng thái kích hoạt.",
        },
        {
          path: "/explorer",
          label: "Giám sát blockchain",
          description: "Theo dõi khối và tra cứu giao dịch trên Fabric.",
        },
        {
          path: "/certificates",
          label: "Giám sát văn bằng",
          description: "Xem văn bằng đã phát hành, trạng thái và lịch sử.",
        },
        {
          path: "/activity",
          label: "Nhật ký hoạt động",
          description: "Tra cứu hoạt động trong phạm vi nhà trường.",
        },
      ] satisfies WorkspaceLink[],
    };
  }
  if (kind === "approver") {
    return {
      kind,
      title: "Quản lý văn bằng · TP.HCM",
      roleLabel: "CÁN BỘ · DUYỆT VÀ PHÁT HÀNH",
      color: "#0056b3",
      scope: "Cơ sở chính TP. Hồ Chí Minh",
      description:
        "Một cán bộ quản lý dữ liệu, đối soát hồ sơ và duyệt phát hành ngay tại cơ sở chính. Không chuyển hồ sơ sang đơn vị khác.",
      links: [
        {
          path: "/diploma-records",
          label: "Hồ sơ cấp văn bằng",
          description: "Nhập hồ sơ, kiểm tra dữ liệu, duyệt và phát hành.",
          children: [
            {
              path: "/students",
              label: "Hồ sơ sinh viên",
              description: "Quản lý và đối soát thông tin sinh viên.",
            },
            {
              path: "/students/import",
              label: "Nhập sinh viên",
              description: "Nhập hồ sơ sinh viên và tài khoản.",
            },
            {
              path: "/import",
              label: "Kiểm tra dữ liệu",
              description:
                "Nhập sổ gốc, kiểm tra và sửa dữ liệu trước khi duyệt.",
            },
            {
              path: "/pending",
              label: "Hồ sơ chờ xử lý",
              description:
                "Duyệt hồ sơ chờ xử lý, bổ sung và trình lại hồ sơ bị từ chối.",
            },
            {
              path: "/issue",
              label: "Duyệt và phát hành",
              description:
                "Xem trước PDF, duyệt, ký số và ghi nhận blockchain.",
            },
          ],
        },
        {
          path: "/certificates",
          label: "Sổ văn bằng",
          description: "Theo dõi phát hành, tải PDF, xác thực và thu hồi.",
        },
        {
          path: "/catalog",
          label: "Danh mục",
          description:
            "Quản lý ngành đào tạo và ánh xạ tên ngành để kiểm tra dữ liệu.",
        },
        {
          path: "/activity",
          label: "Nhật ký hoạt động",
          description: "Tra cứu lịch sử nhập, sửa dữ liệu, duyệt và thu hồi.",
        },
        {
          path: "/explorer",
          label: "Đối chiếu blockchain",
          description:
            "Đối chiếu giao dịch phát hành, thu hồi và theo dõi lỗi đồng bộ.",
        },
      ] satisfies WorkspaceLink[],
    };
  }
  return {
    kind,
    title: "Cổng văn bằng sinh viên",
    roleLabel: "SINH VIÊN",
    color: "#0056b3",
    scope: "Chỉ văn bằng của chính mình",
    description:
      "Xem văn bằng đã phát hành, tải PDF và chia sẻ minh chứng xác thực.",
    links: [
      {
        path: "/student/dashboard",
        label: "Văn bằng của tôi",
        description: "Xem và chia sẻ văn bằng đã được phát hành.",
      },
      {
        path: "/student/profile",
        label: "Hồ sơ của tôi",
        description: "Xem thông tin tài khoản sinh viên.",
      },
    ] satisfies WorkspaceLink[],
  };
}

export function getWorkspaceLinks(
  user?: WorkspaceUser | null,
): WorkspaceLink[] {
  return getWorkspace(user).links.flatMap((link) => [
    link,
    ...(link.children || []),
  ]);
}

export function canAccessWorkspacePath(
  user: WorkspaceUser | null | undefined,
  pathname: string,
) {
  const kind = getWorkspaceKind(user);
  const path = pathname.split("?")[0]?.replace(/\/$/, "") || "/";
  if (path === "/dashboard") return ["admin", "approver"].includes(kind);
  return (
    kind !== "none" &&
    getWorkspaceLinks(user).some((link) => link.path === path)
  );
}

export function getDiplomaActions(
  user: WorkspaceUser | null | undefined,
  record: {
    status?: string;
    documentStatus?: string;
    org?: string;
    replacement?: unknown;
  },
) {
  const kind = getWorkspaceKind(user);
  const staff = ["admin", "approver"].includes(kind);
  return {
    view: staff,
    history: staff,
    submit:
      kind === "approver" &&
      record.status === "DRAFT" &&
      !!user?.org &&
      record.org === user.org,
    verify:
      staff &&
      ["ON_CHAIN", "REVOKED", "REPLACED"].includes(record.status || ""),
    share:
      ["approver", "student"].includes(kind) && record.status === "ON_CHAIN",
    revoke:
      kind === "approver" &&
      record.status === "ON_CHAIN" &&
      record.documentStatus === "ACTIVE" &&
      !record.replacement,
    replace:
      kind === "approver" &&
      record.status === "ON_CHAIN" &&
      record.documentStatus === "ACTIVE" &&
      !record.replacement,
  };
}
