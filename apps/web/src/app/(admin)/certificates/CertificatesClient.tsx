"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  getDiplomaActions,
  getWorkspace,
  type WorkspaceUser,
} from "@/lib/workspace-access";
import { generateCertPDF } from "@/lib/generateCertPDF";
import {
  describeRegisterFilters,
  emptyRegisterFilters,
  registerDate,
  registerHeaders,
  registerParams,
  registerSheetRows,
  registerStatuses,
  type RegisterEntry,
  type RegisterFilters,
} from "@/lib/diploma-register";
import {
  Table,
  Button,
  Typography,
  Tag,
  message,
  Modal,
  Space,
  Tooltip,
  Timeline,
  Spin,
  Input,
  Descriptions,
  Dropdown,
  Alert,
  Form,
  InputNumber,
  Select,
} from "antd";
import {
  CopyOutlined,
  SafetyCertificateOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  QrcodeOutlined,
  ReloadOutlined,
  DownloadOutlined,
  MoreOutlined,
  EyeOutlined,
  HistoryOutlined,
  FileExcelOutlined,
} from "@ant-design/icons";
import QRCode from "react-qr-code";
import Link from "next/link";
import ReplacementCreateModal from "@/components/ReplacementCreateModal";
import { replacementEventLabels } from "@/lib/diploma-replacements";

const { Text } = Typography;
const eventLabels: Record<string, string> = {
  ...replacementEventLabels,
  IMPORTED_DRAFT: "Hoàn tất rà soát và lưu hồ sơ",
  REVIEWED_ISSUE_DATE: "Đối soát ngày cấp theo hồ sơ gốc",
  REQUESTED: "Lưu hồ sơ chờ xử lý",
  APPROVED: "Cán bộ đã duyệt phát hành",
  CAMPUS_PDF_SIGNED: "Cơ sở đã ký số PDF",
  REJECTED: "Cán bộ từ chối",
  REOPENED: "Mở lại để bổ sung",
  CORRECTED: "Bổ sung hồ sơ sau từ chối",
  RESUBMITTED: "Trình duyệt lại hồ sơ",
  ANCHOR_COMMITTED: "Blockchain đã xác nhận giao dịch",
  ANCHOR_RETRY_REQUESTED: "Yêu cầu khôi phục giao dịch blockchain",
  REVOKED: "Thu hồi văn bằng",
};

export default function CertificatesClient({
  user,
  initialSearch = "",
}: {
  user: WorkspaceUser;
  initialSearch?: string;
}) {
  const workspace = getWorkspace(user);
  const [detailRecord, setDetailRecord] = useState<any>(null);
  const [replacementRecord, setReplacementRecord] = useState<any>(null);
  const [loadingVerify, setLoadingVerify] = useState<Record<string, boolean>>(
    {},
  );
  const [qrRecord, setQrRecord] = useState<any>(null);
  const [auditRecord, setAuditRecord] = useState<any>(null);
  const [revokeRecord, setRevokeRecord] = useState<any>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [certData, setCertData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(() =>
    emptyRegisterFilters(initialSearch),
  );
  const [appliedFilters, setAppliedFilters] = useState(() =>
    emptyRegisterFilters(initialSearch),
  );
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const requestId = useRef(0);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });

  const exportExcel = async () => {
    if (exporting || loading || !pagination.total) return;
    setExporting(true);
    try {
      message.loading({ content: "Đang xuất Excel...", key: "export" });
      const allRows: RegisterEntry[] = [];
      let currentPage = 1,
        totalPages = 1;
      do {
        const response = await fetch(
          `/api/certificates?${registerParams(appliedFilters, currentPage, 100)}`,
          { cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok || !result.success)
          throw new Error(result.error || "Không tải được dữ liệu xuất sổ");
        if (result.pagination.total !== pagination.total)
          throw new Error(
            "Dữ liệu sổ vừa thay đổi. Anh làm mới danh sách rồi xuất lại.",
          );
        allRows.push(...result.data);
        totalPages = result.pagination.totalPages;
        currentPage++;
      } while (currentPage <= totalPages);
      if (
        allRows.length !== pagination.total ||
        new Set(allRows.map((entry) => entry.uuid)).size !== allRows.length
      )
        throw new Error(
          "Dữ liệu sổ vừa thay đổi. Anh làm mới danh sách rồi xuất lại.",
        );
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet(
        registerSheetRows(allRows, appliedFilters),
      );
      ws["!cols"] = [
        7, 28, 18, 14, 36, 16, 10, 18, 18, 24, 28, 14, 30, 18, 18, 24, 40,
      ].map((width) => ({ wch: width }));
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: registerHeaders.length - 1 } },
      ];
      ws["!autofilter"] = {
        ref: XLSX.utils.encode_range({
          s: { r: 5, c: 0 },
          e: { r: allRows.length + 5, c: registerHeaders.length - 1 },
        }),
      };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "SoVanBang");
      XLSX.writeFile(
        wb,
        `SoVanBang_${new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).replace(/\//g, "-")}.xlsx`,
      );
      message.success({ content: "Xuất Excel thành công!", key: "export" });
    } catch (error) {
      message.error({
        content:
          error instanceof Error
            ? error.message
            : "Không xuất được sổ văn bằng",
        key: "export",
      });
    } finally {
      setExporting(false);
    }
  };

  const fetchCerts = useCallback(
    async (page: number, limit: number, nextFilters: RegisterFilters) => {
      const currentRequest = ++requestId.current;
      setLoading(true);
      setLoadError("");
      try {
        const res = await fetch(
          `/api/certificates?${registerParams(nextFilters, page, limit)}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (currentRequest !== requestId.current) return;
        if (!res.ok || !json.success)
          throw new Error(json.error || "Không tải được sổ văn bằng");
        setCertData(json.data);
        setPagination({
          current: page,
          pageSize: limit,
          total: json.pagination.total,
        });
      } catch (error) {
        if (currentRequest !== requestId.current) return;
        setLoadError(
          error instanceof Error ? error.message : "Không kết nối được máy chủ",
        );
        setCertData([]);
        setPagination({ current: 1, pageSize: limit, total: 0 });
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    },
    [],
  );

  const cancelPendingFetch = useCallback(() => {
    requestId.current++;
  }, []);

  useEffect(() => {
    const initialFilters = emptyRegisterFilters(initialSearch);
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    void fetchCerts(1, 20, initialFilters);
    return cancelPendingFetch;
  }, [fetchCerts, initialSearch, cancelPendingFetch]);

  const applyFilters = () => {
    if (
      filters.issuedFrom &&
      filters.issuedTo &&
      filters.issuedFrom > filters.issuedTo
    ) {
      message.warning("Ngày cấp từ phải trước hoặc bằng ngày cấp đến");
      return;
    }
    setAppliedFilters({ ...filters });
    void fetchCerts(1, pagination.pageSize, filters);
  };

  React.useEffect(() => {
    if (!auditRecord) return;
    setAuditLoading(true);
    setAuditHistory([]);
    fetch(`/api/audit?certUUID=${auditRecord.uuid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setAuditHistory(d.history);
        else message.error("Lỗi: " + d.error);
      })
      .catch(() => message.error("Không thể tải lịch sử xử lý hồ sơ"))
      .finally(() => setAuditLoading(false));
  }, [auditRecord]);

  const handleRevoke = async () => {
    if (!revokeReason.trim()) {
      message.warning("Vui lòng nhập lý do thu hồi!");
      return;
    }
    setRevoking(true);
    try {
      const res = await fetch("/api/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certUUID: revokeRecord.uuid,
          reason: revokeReason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        message.success("Đã thu hồi văn bằng thành công!");
        setRevokeRecord(null);
        setRevokeReason("");
        await fetchCerts(
          pagination.current,
          pagination.pageSize,
          appliedFilters,
        );
      } else {
        message.error("Lỗi: " + data.error);
      }
    } catch {
      message.error("Lỗi kết nối!");
    } finally {
      setRevoking(false);
    }
  };

  const handleVerify = async (record: any) => {
    setLoadingVerify((prev) => ({ ...prev, [record.uuid]: true }));
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          record.proof || {
            uuid: record.uuid,
            certUUID: record.uuid,
            certHash: record.certHash,
            fullName: record.fullName,
            mssv: record.mssv,
            major: record.major,
            gpa: record.gpa,
            grade: record.grade,
            issueDate: record.issueDate,
            soHieu: record.soHieu,
            soVaoSo: record.soVaoSo,
            className: record.className,
            namTotNghiep: record.namTotNghiep,
          },
        ),
      });
      const result = await res.json();

      if (!result.success) {
        Modal.error({
          title: "Lỗi xác thực",
          content: result.error || "Không thể kết nối hệ thống xác thực.",
        });
        return;
      }

      const { isValid, details } = result;

      Modal[isValid ? "success" : "error"]({
        title: isValid ? (
          <span>
            <CheckCircleFilled style={{ color: "#52c41a", marginRight: 8 }} />
            Văn bằng hợp lệ
          </span>
        ) : (
          <span>
            <CloseCircleFilled style={{ color: "#ff4d4f", marginRight: 8 }} />
            CHƯA XÁC MINH ĐƯỢC
          </span>
        ),
        width: 560,
        content: (
          <div style={{ fontSize: 13 }}>
            <p
              style={{
                marginBottom: 12,
                color: isValid ? "#389e0d" : "#cf1322",
                fontWeight: 500,
              }}
            >
              {result.message}
            </p>
            {details && (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {[
                    ["Sinh viên", details.studentName],
                    ["MSSV", details.mssv],
                    ["Ngày xác thực", details.blockchainDate],
                    [
                      "Tx ID",
                      details.txId
                        ? `${details.txId.substring(0, 20)}...`
                        : "—",
                    ],
                  ].map(([label, value]) => (
                    <tr
                      key={label}
                      style={{ borderBottom: "1px solid #f0f0f0" }}
                    >
                      <td
                        style={{
                          padding: "6px 8px",
                          color: "#888",
                          width: 130,
                        }}
                      >
                        {label}
                      </td>
                      <td style={{ padding: "6px 8px", fontWeight: 500 }}>
                        {value || "—"}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "6px 8px", color: "#888" }}>
                      Hash blockchain
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <Text
                        code
                        copyable={{ text: details.onChainHash }}
                        style={{ fontSize: 11 }}
                      >
                        {details.onChainHash?.substring(0, 20)}...
                      </Text>
                    </td>
                  </tr>
                  {!isValid && (
                    <tr>
                      <td style={{ padding: "6px 8px", color: "#888" }}>
                        Hash hiện tại
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <Text code style={{ fontSize: 11, color: "#cf1322" }}>
                          {details.currentHash?.substring(0, 20)}...
                        </Text>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        ),
      });
    } catch {
      message.error("Lỗi kết nối server xác thực!");
    } finally {
      setLoadingVerify((prev) => ({ ...prev, [record.uuid]: false }));
    }
  };

  const statusLabels = registerStatuses;

  const columns = [
    {
      title: "STT",
      key: "index",
      width: 65,
      render: (_value: unknown, _record: unknown, index: number) =>
        (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    { title: "Họ và tên", dataIndex: "fullName", key: "fullName", width: 180 },
    {
      title: "MSSV",
      dataIndex: "mssv",
      key: "mssv",
      width: 120,
      render: (v: string) => v || <i style={{ color: "#bbb" }}>—</i>,
    },
    { title: "Ngành đào tạo", dataIndex: "major", key: "major" },
    {
      title: "Năm tốt nghiệp",
      dataIndex: "namTotNghiep",
      key: "namTotNghiep",
      width: 110,
    },
    { title: "Xếp loại", dataIndex: "grade", key: "grade", width: 130 },
    { title: "Số hiệu", dataIndex: "soHieu", key: "soHieu", width: 180 },
    { title: "Số vào sổ", dataIndex: "soVaoSo", key: "soVaoSo", width: 180 },
    {
      title: "Ngày cấp",
      dataIndex: "issueDate",
      key: "issueDate",
      width: 110,
      render: (value: string | null) => registerDate(value) || "Chưa có",
    },
    {
      title: "Quyết định tốt nghiệp",
      dataIndex: "decisionNo",
      key: "decisionNo",
      width: 180,
      render: (value: string | null) => value || "—",
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 160,
      render: (status: string) => (
        <Tag color={statusLabels[status]?.color || "default"}>
          {statusLabels[status]?.label || status}
        </Tag>
      ),
    },
    {
      title: "Thao tác",
      key: "action",
      width: 200,
      render: (_: any, record: any) => {
        const actions = getDiplomaActions(user, record);
        const items = [
          {
            key: "detail",
            icon: <EyeOutlined />,
            label: "Chi tiết",
            onClick: () => setDetailRecord(record),
          },
          ...(actions.share
            ? [
                {
                  key: "qr",
                  icon: <QrcodeOutlined />,
                  label: "Mã QR xác thực",
                  onClick: () => setQrRecord(record),
                },
              ]
            : []),
          ...(actions.history
            ? [
                {
                  key: "history",
                  icon: <HistoryOutlined />,
                  label: "Lịch sử xử lý",
                  onClick: () => setAuditRecord(record),
                },
              ]
            : []),
          ...(actions.revoke
            ? [
                {
                  key: "revoke",
                  danger: true,
                  label: "Thu hồi văn bằng",
                  onClick: () => {
                    setRevokeRecord(record);
                    setRevokeReason("");
                  },
                },
              ]
            : []),
          ...(actions.replace
            ? [
                {
                  key: "replacement",
                  label: "Sửa sai và phát hành thay thế",
                  onClick: () => setReplacementRecord(record),
                },
              ]
            : []),
          ...(record.replacement && workspace.kind === "approver"
            ? [
                {
                  key: "replacement-file",
                  label: "Xem hồ sơ thay thế",
                  onClick: () => {
                    window.location.href =
                      "/pending?view=replacements&stage=" +
                      record.replacement.workflowStatus;
                  },
                },
              ]
            : []),
        ];
        return (
          <Space>
            {actions.verify && (
              <Button
                type="primary"
                size="small"
                icon={<SafetyCertificateOutlined />}
                loading={loadingVerify[record.uuid]}
                onClick={() => handleVerify(record)}
              >
                Xác thực
              </Button>
            )}
            {actions.share && (
              <Tooltip
                title={
                  record.signedPdfAvailable
                    ? "Tải PDF đã ký số"
                    : "Chưa có PDF phát hành"
                }
              >
                <Button
                  size="small"
                  aria-label="Tải PDF đã ký số"
                  icon={<DownloadOutlined />}
                  disabled={!record.signedPdfAvailable}
                  onClick={async () => {
                    try {
                      await generateCertPDF(record);
                    } catch (error) {
                      message.error(
                        error instanceof Error
                          ? error.message
                          : "Không tải được PDF",
                      );
                    }
                  }}
                />
              </Tooltip>
            )}
            <Dropdown menu={{ items }} trigger={["click"]}>
              <Button
                size="small"
                aria-label="Thao tác khác"
                title="Thao tác khác"
                icon={<MoreOutlined />}
              />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  const verifyUrl = qrRecord
    ? window.location.origin +
      "/verify?proof=" +
      encodeURIComponent(JSON.stringify({ uuid: qrRecord.uuid }))
    : "";

  return (
    <>
      {workspace.kind === "approver" && (
        <div className="mb-4">
          <Link href="/pending?view=replacements">
            Quản lý hồ sơ sửa sai và phát hành thay thế
          </Link>
        </div>
      )}
      {replacementRecord && (
        <ReplacementCreateModal
          source={replacementRecord}
          onClose={() => setReplacementRecord(null)}
        />
      )}
      <Modal
        open={!!detailRecord}
        onCancel={() => setDetailRecord(null)}
        footer={null}
        title="Chi tiết hồ sơ văn bằng"
        width={720}
      >
        {detailRecord && (
          <>
            {detailRecord.replaces && (
              <Alert
                className="mb-4"
                type="info"
                showIcon
                title={
                  "Văn bằng thay thế cho số hiệu " +
                  detailRecord.replaces.certificateNo
                }
              />
            )}
            {detailRecord.replacement && (
              <Alert
                className="mb-4"
                type="warning"
                showIcon
                title={"Có hồ sơ thay thế: " + detailRecord.replacement.soHieu}
                description={
                  detailRecord.replacement.committed
                    ? "Văn bằng thay thế đã được ghi nhận. Bản cũ không còn hiệu lực."
                    : detailRecord.status === "REPLACED"
                      ? "Bản cũ đã ngừng hiệu lực. Văn bằng thay thế đang chờ đồng bộ."
                      : "Hồ sơ thay thế đang được xử lý; bản cũ chưa tự ngừng hiệu lực."
                }
              />
            )}
            <Descriptions
              column={1}
              bordered
              size="small"
              items={[
                {
                  key: "student",
                  label: "Sinh viên",
                  children: detailRecord.fullName,
                },
                {
                  key: "mssv",
                  label: "Mã sinh viên",
                  children: detailRecord.mssv,
                },
                {
                  key: "dob",
                  label: "Ngày sinh",
                  children: registerDate(detailRecord.dob) || "—",
                },
                {
                  key: "campus",
                  label: "Cơ sở lập hồ sơ",
                  children: detailRecord.campusName || detailRecord.org,
                },
                {
                  key: "issuer",
                  label: "Đơn vị phát hành",
                  children: detailRecord.issuingCampusName || "Chưa phát hành",
                },
                {
                  key: "major",
                  label: "Ngành đào tạo",
                  children: detailRecord.major,
                },
                {
                  key: "gpa",
                  label: "GPA",
                  children: detailRecord.gpa ?? "Nguồn không có",
                },
                {
                  key: "grade",
                  label: "Xếp loại",
                  children: detailRecord.grade || "—",
                },
                {
                  key: "year",
                  label: "Năm tốt nghiệp",
                  children: detailRecord.namTotNghiep,
                },
                {
                  key: "number",
                  label: "Số hiệu văn bằng",
                  children: detailRecord.soHieu,
                },
                {
                  key: "registry",
                  label: "Số vào sổ",
                  children: detailRecord.soVaoSo,
                },
                {
                  key: "date",
                  label: "Ngày cấp",
                  children:
                    registerDate(detailRecord.issueDate) || "Chưa xác nhận",
                },
                {
                  key: "decision",
                  label: "Quyết định tốt nghiệp",
                  children:
                    [
                      detailRecord.decisionNo,
                      registerDate(detailRecord.decisionDate),
                    ]
                      .filter(Boolean)
                      .join(" — ") || "—",
                },
                {
                  key: "revocation",
                  label: "Thông tin thu hồi",
                  children:
                    detailRecord.status === "REVOKED"
                      ? detailRecord.revokedReason || "—"
                      : "Không có",
                },
                {
                  key: "status",
                  label: "Trạng thái",
                  children:
                    statusLabels[detailRecord.status]?.label ||
                    detailRecord.status,
                },
                {
                  key: "reason",
                  label: "Lý do thu hồi",
                  children: detailRecord.revokedReason || "—",
                },
                {
                  key: "transaction",
                  label: "Giao dịch blockchain",
                  children: detailRecord.txId ? (
                    <Text copyable style={{ wordBreak: "break-all" }}>
                      {detailRecord.txId}
                    </Text>
                  ) : (
                    "Chưa có giao dịch được xác nhận"
                  ),
                },
              ]}
            />
          </>
        )}
      </Modal>
      <Modal
        open={!!qrRecord}
        onCancel={() => setQrRecord(null)}
        footer={null}
        title={qrRecord ? `QR Code — ${qrRecord.fullName}` : ""}
        centered
      >
        {qrRecord && (
          <div className="flex flex-col items-center gap-4 p-4">
            <QRCode
              value={verifyUrl}
              size={300}
              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
            />
            <Typography.Text type="secondary" className="text-center text-xs">
              Quét QR để xác thực văn bằng tại trang công khai
            </Typography.Text>
            <Button
              icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(verifyUrl);
                message.success("Đã copy link xác thực!");
              }}
            >
              Copy Link
            </Button>
          </div>
        )}
      </Modal>
      <div className="p-8 bg-white min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <Typography.Title level={2}>
              {
                workspace.links.find((link) => link.path === "/certificates")
                  ?.label
              }
            </Typography.Title>
            <Typography.Text type="secondary">
              {workspace.kind === "admin"
                ? "Danh sách văn bằng đã phát hành và lịch sử xử lý."
                : workspace.kind === "approver"
                  ? "Quản lý văn bằng đã phát hành, tải PDF ký số, xem lịch sử và thu hồi khi cần. Hồ sơ chưa phát hành được xử lý tại Hồ sơ cấp văn bằng."
                  : "Văn bằng đã phát hành của cơ sở."}
            </Typography.Text>
          </div>
          <Form layout="vertical" onFinish={applyFilters} disabled={exporting}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-4">
              <Form.Item label="Tra cứu văn bằng" htmlFor="register-search">
                <Input
                  id="register-search"
                  placeholder="Họ tên, MSSV, số hiệu, số vào sổ"
                  allowClear
                  maxLength={255}
                  value={filters.search}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      search: event.target.value,
                    }))
                  }
                />
              </Form.Item>
              <Form.Item label="Năm tốt nghiệp" htmlFor="register-year">
                <InputNumber
                  id="register-year"
                  placeholder="Tất cả năm"
                  min={1900}
                  max={2200}
                  precision={0}
                  style={{ width: "100%" }}
                  value={filters.year ? Number(filters.year) : null}
                  onChange={(value) =>
                    setFilters((previous) => ({
                      ...previous,
                      year: value == null ? "" : String(value),
                    }))
                  }
                />
              </Form.Item>
              <Form.Item label="Ngành đào tạo" htmlFor="register-major">
                <Input
                  id="register-major"
                  placeholder="Nhập tên ngành"
                  allowClear
                  maxLength={255}
                  value={filters.major}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      major: event.target.value,
                    }))
                  }
                />
              </Form.Item>
              <Form.Item
                label="Quyết định tốt nghiệp"
                htmlFor="register-decision"
              >
                <Input
                  id="register-decision"
                  placeholder="Nhập số quyết định"
                  allowClear
                  maxLength={120}
                  value={filters.decision}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      decision: event.target.value,
                    }))
                  }
                />
              </Form.Item>
              <Form.Item label="Trạng thái văn bằng" htmlFor="register-status">
                <Select
                  id="register-status"
                  placeholder="Tất cả trạng thái"
                  allowClear
                  value={filters.status || undefined}
                  options={Object.entries(registerStatuses).map(
                    ([value, status]) => ({ value, label: status.label }),
                  )}
                  onChange={(value) =>
                    setFilters((previous) => ({
                      ...previous,
                      status: value || "",
                    }))
                  }
                />
              </Form.Item>
              <Form.Item label="Ngày cấp từ" htmlFor="register-issued-from">
                <Input
                  id="register-issued-from"
                  type="date"
                  value={filters.issuedFrom}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      issuedFrom: event.target.value,
                    }))
                  }
                />
              </Form.Item>
              <Form.Item label="Ngày cấp đến" htmlFor="register-issued-to">
                <Input
                  id="register-issued-to"
                  type="date"
                  value={filters.issuedTo}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      issuedTo: event.target.value,
                    }))
                  }
                />
              </Form.Item>
            </div>
            <Space wrap className="mb-4">
              <Button type="primary" htmlType="submit" loading={loading}>
                Tra cứu
              </Button>
              <Button
                onClick={() => {
                  const cleared = emptyRegisterFilters();
                  setFilters(cleared);
                  setAppliedFilters(cleared);
                  void fetchCerts(1, pagination.pageSize, cleared);
                }}
              >
                Xóa bộ lọc
              </Button>
            </Space>
          </Form>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Typography.Text type="secondary" className="flex-1">
              {describeRegisterFilters(appliedFilters)} · {pagination.total} văn
              bằng
            </Typography.Text>
            <Tooltip title="Xuất toàn bộ kết quả theo bộ lọc đang áp dụng">
              <Button
                icon={<FileExcelOutlined />}
                aria-label="Xuất Excel"
                onClick={exportExcel}
                loading={exporting}
                disabled={loading || !pagination.total || !!loadError}
              >
                Xuất Excel
              </Button>
            </Tooltip>
            <Tooltip title="Làm mới">
              <Button
                icon={<ReloadOutlined />}
                aria-label="Làm mới"
                loading={loading}
                disabled={exporting}
                onClick={() =>
                  fetchCerts(
                    pagination.current,
                    pagination.pageSize,
                    appliedFilters,
                  )
                }
              />
            </Tooltip>
          </div>
          {loadError && (
            <Alert type="error" showIcon title={loadError} className="mb-4" />
          )}
          <Table
            dataSource={certData}
            columns={columns}
            rowKey="uuid"
            bordered
            size="small"
            loading={loading}
            scroll={{ x: 1900 }}
            locale={{
              emptyText: loadError
                ? "Chưa tải được sổ văn bằng"
                : "Không có văn bằng phù hợp. Hồ sơ chưa phát hành được xử lý tại Hồ sơ cấp văn bằng.",
            }}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              showSizeChanger: true,
              disabled: exporting,
              pageSizeOptions: ["10", "20", "50", "100"],
              showTotal: (total) => `Tổng ${total} văn bằng`,
              onChange: (page, pageSize) =>
                fetchCerts(page, pageSize, appliedFilters),
            }}
            rowClassName={(record) =>
              record.status === "REVOKED"
                ? "bg-red-50"
                : record.status !== "ON_CHAIN"
                  ? "bg-yellow-50"
                  : ""
            }
          />
        </div>
      </div>
      <Modal
        open={!!revokeRecord}
        onCancel={() => {
          setRevokeRecord(null);
          setRevokeReason("");
        }}
        title={
          revokeRecord ? `⚠️ Thu hồi văn bằng — ${revokeRecord.fullName}` : ""
        }
        okText="Xác nhận thu hồi"
        okButtonProps={{ danger: true, loading: revoking }}
        cancelText="Hủy"
        onOk={handleRevoke}
        centered
      >
        <div className="p-2">
          <p className="text-red-500 font-medium mb-4">
            ⚠️ Hành động này không thể hoàn tác. Hồ sơ bị thu hồi trong
            PostgreSQL; sự kiện Fabric được đồng bộ qua outbox.
          </p>
          <p className="mb-2">
            <strong>Sinh viên:</strong> {revokeRecord?.fullName}
          </p>
          <p className="mb-2">
            <strong>MSSV:</strong> {revokeRecord?.mssv}
          </p>
          <p className="mb-4">
            <strong>UUID:</strong>{" "}
            <code className="text-xs">{revokeRecord?.uuid}</code>
          </p>
          <p className="mb-2 font-medium">Lý do thu hồi:</p>
          <Input.TextArea
            rows={3}
            placeholder="VD: Sinh viên vi phạm quy chế thi, bằng cấp không hợp lệ..."
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
          />
        </div>
      </Modal>
      <Modal
        open={!!auditRecord}
        onCancel={() => {
          setAuditRecord(null);
          setAuditHistory([]);
        }}
        footer={null}
        title={auditRecord ? "Lịch sử xử lý — " + auditRecord.fullName : ""}
        width={700}
        centered
      >
        {auditLoading ? (
          <div className="text-center py-8">
            <Spin size="large" />
          </div>
        ) : (
          <div className="p-4">
            <Timeline
              items={auditHistory.map((event, index) => ({
                color:
                  event.eventType === "REJECTED" ||
                  event.eventType === "REVOKED"
                    ? "red"
                    : "blue",
                children: (
                  <div key={event.id || index}>
                    <div className="font-bold text-sm">
                      {eventLabels[event.eventType] || event.eventType}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Thời gian:{" "}
                      {event.timestamp
                        ? new Date(event.timestamp).toLocaleString("vi-VN")
                        : "—"}
                    </div>
                    {event.reason && (
                      <div className="text-sm mt-1">Lý do: {event.reason}</div>
                    )}
                    {event.txId && (
                      <div
                        className="text-xs text-gray-500 mt-1"
                        style={{ wordBreak: "break-all" }}
                      >
                        TxID: <code>{event.txId}</code>
                      </div>
                    )}
                  </div>
                ),
              }))}
            />
            {auditHistory.length === 0 && !auditLoading && (
              <div className="text-center text-gray-400 py-4">
                Chưa có sự kiện xử lý hồ sơ
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
