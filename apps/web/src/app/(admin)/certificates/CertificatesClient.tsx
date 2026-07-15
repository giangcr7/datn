"use client";
import React, { useState, useEffect, useCallback } from "react";
import { generateCertPDF } from "@/lib/generateCertPDF";
import { Table, Button, Typography, Tag, message, Modal, Space, Tooltip, Timeline, Spin, Input } from "antd";
import { CopyOutlined, SafetyCertificateOutlined, CheckCircleFilled, CloseCircleFilled, QrcodeOutlined, SearchOutlined } from "@ant-design/icons";
import QRCode from "react-qr-code";

const { Text } = Typography;

export default function CertificatesClient({ data }: { data: any[] }) {
  const [loadingVerify, setLoadingVerify] = useState<Record<string, boolean>>({});
  const [qrRecord, setQrRecord] = useState<any>(null);
  const [auditRecord, setAuditRecord] = useState<any>(null);
  const [revokeRecord, setRevokeRecord] = useState<any>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [certData, setCertData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const exportExcel = async () => {
    try {
      message.loading({ content: 'Đang xuất Excel...', key: 'export' });
      const res = await fetch(`/api/certificates?page=1&limit=99999&search=${encodeURIComponent(search)}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      
      const XLSX = require('xlsx');
      const rows = json.data.map((c: any, i: number) => ({
        'STT': i + 1,
        'UUID': c.uuid,
        'Họ và tên': c.fullName,
        'MSSV': c.mssv,
        'Ngành học': c.major,
        'GPA': c.gpa,
        'Xếp loại': c.grade,
        'Lớp': c.className,
        'Năm TN': c.namTotNghiep,
        'Số hiệu': c.soHieu,
        'Ngày cấp': c.issueDate,
        'Trạng thái': c.status,
      }));
      
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'DanhSachVanBang');
      XLSX.writeFile(wb, `VanBang_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`);
      message.success({ content: 'Xuất Excel thành công!', key: 'export' });
    } catch (err: any) {
      message.error({ content: 'Lỗi xuất Excel: ' + err.message, key: 'export' });
    }
  };

  const fetchCerts = useCallback(async (page = 1, limit = 20, q = "") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/certificates?page=${page}&limit=${limit}&search=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json.success) {
        setCertData(json.data);
        setPagination(prev => ({ ...prev, current: page, pageSize: limit, total: json.pagination.total }));
      }
    } catch { message.error("Lỗi tải dữ liệu!"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCerts(); }, [fetchCerts]);

  // ✅ Tạo proof JSON đầy đủ để copy — gồm uuid + certHash để verify được
  React.useEffect(() => {
    if (!auditRecord) return;
    setAuditLoading(true);
    setAuditHistory([]);
    fetch(`/api/audit?certUUID=${auditRecord.uuid}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) setAuditHistory(d.history);
        else message.error('Lỗi: ' + d.error);
      })
      .finally(() => setAuditLoading(false));
  }, [auditRecord]);

  const handleRevoke = async () => {
    if (!revokeReason.trim()) {
      message.warning('Vui lòng nhập lý do thu hồi!');
      return;
    }
    setRevoking(true);
    try {
      const res = await fetch('/api/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certUUID: revokeRecord.uuid, reason: revokeReason }),
      });
      const data = await res.json();
      if (data.success) {
        message.success('Đã thu hồi văn bằng thành công!');
        setRevokeRecord(null);
        setRevokeReason('');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        message.error('Lỗi: ' + data.error);
      }
    } catch {
      message.error('Lỗi kết nối!');
    } finally {
      setRevoking(false);
    }
  };

  const buildProof = (record: any) =>
    JSON.stringify({
      certUUID:     record.uuid,
      certHash:     record.certHash,
      fullName:     record.fullName,
      mssv:         record.mssv,
      major:        record.major,
      gpa:          record.gpa,
      grade:        record.grade,
      issueDate:    record.issueDate,
      soHieu:       record.soHieu,
      soVaoSo:      record.soVaoSo,
      className:    record.className,
      namTotNghiep: record.namTotNghiep,
    }, null, 2);

  const handleVerify = async (record: any) => {
    setLoadingVerify((prev) => ({ ...prev, [record.uuid]: true }));
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uuid:         record.uuid,
          certUUID:     record.uuid,
          certHash:     record.certHash,
          fullName:     record.fullName,
          mssv:         record.mssv,
          major:        record.major,
          gpa:          record.gpa,
          grade:        record.grade,
          issueDate:    record.issueDate,
          soHieu:       record.soHieu,
          soVaoSo:      record.soVaoSo,
          className:    record.className,
          namTotNghiep: record.namTotNghiep,
        }),
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
          <span><CheckCircleFilled style={{ color: "#52c41a", marginRight: 8 }} />Văn bằng hợp lệ</span>
        ) : (
          <span><CloseCircleFilled style={{ color: "#ff4d4f", marginRight: 8 }} />CẢNH BÁO GIẢ MẠO!</span>
        ),
        width: 560,
        content: (
          <div style={{ fontSize: 13 }}>
            <p style={{ marginBottom: 12, color: isValid ? "#389e0d" : "#cf1322", fontWeight: 500 }}>
              {result.message}
            </p>
            {details && (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {[
                    ["Sinh viên",     details.studentName],
                    ["MSSV",          details.mssv],
                    ["Ngày xác thực", details.blockchainDate],
                    ["Tx ID",         details.txId ? `${details.txId.substring(0, 20)}...` : "—"],
                  ].map(([label, value]) => (
                    <tr key={label} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "6px 8px", color: "#888", width: 130 }}>{label}</td>
                      <td style={{ padding: "6px 8px", fontWeight: 500 }}>{value || "—"}</td>
                    </tr>
                  ))}
                  <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "6px 8px", color: "#888" }}>Hash blockchain</td>
                    <td style={{ padding: "6px 8px" }}>
                      <Text code copyable={{ text: details.onChainHash }} style={{ fontSize: 11 }}>
                        {details.onChainHash?.substring(0, 20)}...
                      </Text>
                    </td>
                  </tr>
                  {!isValid && (
                    <tr>
                      <td style={{ padding: "6px 8px", color: "#888" }}>Hash hiện tại</td>
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

  const columns = [
    { title: "Sinh viên",    dataIndex: "fullName", key: "fullName", width: 180 },
    {
      title: "MSSV", dataIndex: "mssv", key: "mssv", width: 120,
      render: (v: string) => v || <i style={{ color: "#bbb" }}>—</i>,
    },
    { title: "Ngành đào tạo", dataIndex: "major", key: "major" },
    { title: "Xếp loại",     dataIndex: "grade", key: "grade", width: 130 },
    {
      title: "Mã Hash (On-chain)", dataIndex: "certHash", key: "certHash", width: 160,
      render: (hash: string) => (
        <Tooltip title={hash}>
          <Text code style={{ fontSize: 11 }}>{hash?.substring(0, 12)}...</Text>
        </Tooltip>
      ),
    },
    {
      title: "Trạng thái", dataIndex: "status", key: "status", width: 160,
      render: (status: string) => (
        <Tag color={status === "ON_CHAIN" ? "green" : "red"}>
          {status === "ON_CHAIN" ? "ĐÃ LÊN BLOCKCHAIN" : "LỖI"}
        </Tag>
      ),
    },
    {
      title: "Hành động", key: "action", width: 200,
      render: (_: any, record: any) => (
        <Space>
          <Button
            type="primary"
            icon={<SafetyCertificateOutlined />}
            onClick={() => handleVerify(record)}
            loading={loadingVerify[record.uuid]}
            size="small"
          >
            Verify
          </Button>
          {/* ✅ Copy PROOF JSON đầy đủ thay vì chỉ copy hash */}
          <Tooltip title="Copy chuỗi Proof JSON để gửi cho người cần xác thực">
            <Button
              icon={<CopyOutlined />}
              size="small"
              onClick={() => {
                navigator.clipboard.writeText(buildProof(record));
                message.success("Đã copy Proof JSON! Dán vào trang Xác thực để kiểm định.");
              }}
            >
              Copy Proof
            </Button>
          </Tooltip>
          <Tooltip title="Hiển thị QR Code để quét xác thực">
            <Button
              icon={<QrcodeOutlined />}
              size="small"
              onClick={() => setQrRecord(record)}
            >
              QR Code
            </Button>
          </Tooltip>
          <Tooltip title="Tải PDF văn bằng số có QR Code">
            <Button
              size="small"
              onClick={async () => {
                const url = `${window.location.origin}/verify?proof=${encodeURIComponent(buildProof(record))}`;
                await generateCertPDF(record, url);
              }}
            >
              PDF
            </Button>
          </Tooltip>
          <Tooltip title="Xem lịch sử giao dịch trên Blockchain">
            <Button size="small" onClick={() => setAuditRecord(record)}>
              Audit
            </Button>
          </Tooltip>
          {record.status !== 'REVOKED' && (
          <Tooltip title="Thu hồi văn bằng này">
            <Button
              size="small"
              danger
              onClick={() => { setRevokeRecord(record); setRevokeReason(''); }}
            >
              Thu hồi
            </Button>
          </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const verifyUrl = qrRecord
    ? `${window.location.origin}/verify?proof=${encodeURIComponent(buildProof(qrRecord))}`
    : "";

  return (
    <>
    <Modal
      open={!!qrRecord}
      onCancel={() => setQrRecord(null)}
      footer={null}
      title={qrRecord ? `QR Code — ${qrRecord.fullName}` : ""}
      centered
    >
      {qrRecord && (
        <div className="flex flex-col items-center gap-4 p-4">
          <QRCode value={verifyUrl} size={300} style={{height:"auto", maxWidth:"100%", width:"100%"}}/>
          <Typography.Text type="secondary" className="text-center text-xs">
            Quét QR để xác thực văn bằng tại trang công khai
          </Typography.Text>
          <Button
            icon={<CopyOutlined />}
            onClick={() => { navigator.clipboard.writeText(verifyUrl); message.success("Đã copy link xác thực!"); }}
          >
            Copy Link
          </Button>
        </div>
      )}
    </Modal>
    <div className="p-8 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <Typography.Title level={2}>KHO LƯU TRỮ VĂN BẰNG & KIỂM ĐỊNH</Typography.Title>
          <Typography.Text type="secondary">
            Nhấn <strong>Verify</strong> để đối soát trực tiếp. Nhấn <strong>Copy Proof</strong> để lấy chuỗi minh chứng gửi cho bên thứ ba xác thực.
          </Typography.Text>
        </div>
        <div className="mb-4">
          <Input
            prefix={<SearchOutlined />}
            placeholder="Tìm theo tên, MSSV, số hiệu..."
            allowClear
            size="large"
            style={{ maxWidth: 400 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={() => fetchCerts(1, pagination.pageSize, search)}
            onClear={() => { setSearch(""); fetchCerts(1, pagination.pageSize, ""); }}
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            className="ml-2"
            onClick={() => fetchCerts(1, pagination.pageSize, search)}
          >
            Tìm kiếm
          </Button>
          <Button
            className="ml-2"
            onClick={exportExcel}
          >
            📥 Xuất Excel
          </Button>
        </div>
        <Table
          dataSource={certData}
          columns={columns}
          rowKey="uuid"
          bordered
          size="small"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `Tổng ${total} văn bằng`,
            onChange: (page, pageSize) => fetchCerts(page, pageSize, search),
          }}
          rowClassName={(record) => (record.status === "REVOKED" ? "bg-red-50" : record.status !== "ON_CHAIN" ? "bg-yellow-50" : "")}
        />
      </div>
    </div>
    <Modal
      open={!!revokeRecord}
      onCancel={() => { setRevokeRecord(null); setRevokeReason(''); }}
      title={revokeRecord ? `⚠️ Thu hồi văn bằng — ${revokeRecord.fullName}` : ""}
      okText="Xác nhận thu hồi"
      okButtonProps={{ danger: true, loading: revoking }}
      cancelText="Hủy"
      onOk={handleRevoke}
      centered
    >
      <div className="p-2">
        <p className="text-red-500 font-medium mb-4">
          ⚠️ Hành động này không thể hoàn tác. Văn bằng sẽ bị đánh dấu thu hồi trên Blockchain.
        </p>
        <p className="mb-2"><strong>Sinh viên:</strong> {revokeRecord?.fullName}</p>
        <p className="mb-2"><strong>MSSV:</strong> {revokeRecord?.mssv}</p>
        <p className="mb-4"><strong>UUID:</strong> <code className="text-xs">{revokeRecord?.uuid}</code></p>
        <p className="mb-2 font-medium">Lý do thu hồi:</p>
        <Input.TextArea
          rows={3}
          placeholder="VD: Sinh viên vi phạm quy chế thi, bằng cấp không hợp lệ..."
          value={revokeReason}
          onChange={e => setRevokeReason(e.target.value)}
        />
      </div>
    </Modal>
    <Modal
      open={!!auditRecord}
      onCancel={() => { setAuditRecord(null); setAuditHistory([]); }}
      footer={null}
      title={auditRecord ? `Audit Trail — ${auditRecord.fullName}` : ""}
      width={700}
      centered
    >
      {auditLoading ? (
        <div className="text-center py-8"><Spin size="large" /></div>
      ) : (
        <div className="p-4">
          <Timeline
            items={auditHistory.map((h, i) => ({
              color: i === 0 ? 'green' : 'blue',
              children: (
                <div key={h.txId}>
                  <div className="font-bold text-sm">{i === 0 ? '✅ Giao dịch mới nhất' : `Giao dịch #${auditHistory.length - i}`}</div>
                  <div className="text-xs text-gray-500 mt-1">TxID: <code>{h.txId}</code></div>
                  <div className="text-xs text-gray-500">Thời gian: {h.timestamp ? new Date(h.timestamp.seconds * 1000).toLocaleString('vi-VN') : 'N/A'}</div>
                  <div className="text-xs text-gray-500">Thao tác: {h.isDelete ? '🗑️ Xóa' : '📝 Ghi'}</div>
                </div>
              )
            }))}
          />
          {auditHistory.length === 0 && !auditLoading && (
            <div className="text-center text-gray-400 py-4">Không có lịch sử giao dịch</div>
          )}
        </div>
      )}
    </Modal>
    </>
  );
}
