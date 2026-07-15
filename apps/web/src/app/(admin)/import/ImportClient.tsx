"use client";

import React, { useState } from "react";
import { Upload, Button, Table, Typography, message, Card, Tag, Tooltip, Modal } from "antd";
import { InboxOutlined, UploadOutlined, SyncOutlined, WarningOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";

const { Title } = Typography;
const { Dragger } = Upload;

// Các trường BẮT BUỘC để phát hành văn bằng lên blockchain
const REQUIRED_FIELDS: { key: string; label: string }[] = [
  { key: "mssv",     label: "MSSV" },
  { key: "fullName", label: "Họ và tên" },
  { key: "major",    label: "Ngành đào tạo" },
  { key: "grade",    label: "Xếp loại TN" },
  { key: "soHieu",   label: "Số hiệu văn bằng" },
  { key: "soVaoSo",  label: "Số vào sổ" },
];

function getMissingFields(row: any): string[] {
  return REQUIRED_FIELDS
    .filter(f => !String(row[f.key] || "").trim())
    .map(f => f.label);
}

export default function ImportClient() {
  const [dataPreview, setDataPreview]   = useState<any[]>([]);
  const [loading, setLoading]           = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const router = useRouter();

  // 🌟 ĐÃ FIX: Trả lại lệnh khử chữ Đ tiếng Việt để quét trúng cột Ngành đào tạo
  const normalizeHeader = (str: string) =>
    String(str || "")
      .toLowerCase()
      .replace(/[\s\n\r"'\u00A0]+/g, "")
      .replace(/[đđÐđ]/g, "d") // <-- Lỗi 1955 bản ghi là do thiếu dòng này!
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const handleFileUpload = (file: any) => {
    setDataPreview([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const readOptions: XLSX.ParsingOptions = {
          type: file.name.endsWith(".csv") ? "string" : "binary",
          cellFormula: false,
          cellHTML: false,
          cellText: true,
          raw: false,
        };

        let workbook: XLSX.WorkBook;
        if (file.name.endsWith(".csv") && typeof data === "string") {
          const commaCount     = (data.match(/,/g) || []).length;
          const semicolonCount = (data.match(/;/g) || []).length;
          const processed      = semicolonCount > commaCount ? data.replace(/;/g, ",") : data;
          workbook = XLSX.read(processed, readOptions);
        } else {
          workbook = XLSX.read(data, { ...readOptions, type: "binary" });
        }

        const sheetName = workbook.SheetNames[0];
        const sheet     = workbook.Sheets[sheetName];
        const rawRows   = XLSX.utils.sheet_to_json(sheet, {
          header: 1, raw: false, defval: "",
        }) as any[][];

        if (!rawRows || rawRows.length === 0) throw new Error("Tệp tin trống!");

        // Định vị dòng chứa tiêu đề
        let headerRowIndex = rawRows.findIndex((row) =>
          row?.some((cell: any) => {
            const c = normalizeHeader(String(cell));
            return c.includes("mssv") || c.includes("hova") || c.includes("hoten") || c.includes("masinhvien");
          })
        );
        if (headerRowIndex === -1) headerRowIndex = 0;

        const rawHeaders = [...(rawRows[headerRowIndex] || [])];
        
        // BỘ MAPPING RÚT GỌN SIÊU AN TOÀN CHO FILE "Sochuan_final"
        const mappedHeaders: string[] = rawHeaders.map((h, idx) => {
          const c = normalizeHeader(h);
          if (!c) return "col_trash_" + idx;

          if (c.includes("mssv") || c.includes("masinhvien") || c.includes("masv")) return "mssv";
          if (c.includes("hova") || c.includes("hoten")) return "fullName";
          if (c.includes("ngaysinh")) return "dob";
          if (c.includes("noisinh")) return "pob";
          if (c.includes("gioitinh")) return "gender";
          if (c.includes("dantoc")) return "nation";
          if (c.includes("quoctich")) return "nationality";
          if (c.includes("lop")) return "className";
          if (c.includes("khoahoc") || c === "khoa") return "khuaHoc";
          if (c.includes("nganh")) return "major"; // Quét gọn chữ "nganh" cho chắc chắn
          if (c.includes("diem") || c.includes("gpa")) return "gpa"; 
          if (c.includes("xeploai")) return "grade"; 
          if (c.includes("namtn") || c.includes("namtotnghiep")) return "namTotNghiep";
          if (c.includes("sohieu")) return "soHieu";
          if (c.includes("sovaoso")) return "soVaoSo";
          if (c.includes("soqd") || c.includes("quyetdinh")) return "decisionNo";
          if (c.includes("ngayky") || c === "ngay") return "decisionDate";
          
          return "col_trash_" + idx;
        });

        const cleanedData: any[] = [];

        // Đọc từng dòng dữ liệu
        for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || row.length === 0) continue;
          if (row.every((cell: any) => !String(cell).trim())) continue;

          // Bỏ qua dòng tổng kết
          const firstClean = normalizeHeader(String(row[0]).trim());
          if (firstClean.includes("tongso") || firstClean.includes("tong") || firstClean.includes("gs.ts")) break;

          const rowObj: any = {};
          mappedHeaders.forEach((header, colIdx) => {
            if (header && !header.startsWith("col_trash_")) {
              const val = row[colIdx];
              rowObj[header] = val !== undefined && val !== null ? String(val).trim() : "";
            }
          });

          // Chỉ lấy những dòng có mssv hoặc họ tên
          if (rowObj.mssv || rowObj.fullName) {
            rowObj._missingFields = getMissingFields(rowObj);
            rowObj._hasWarning    = rowObj._missingFields.length > 0;
            cleanedData.push(rowObj);
          }
        }

        if (cleanedData.length === 0) throw new Error("Không tìm thấy dữ liệu hợp lệ trong file!");

        // 🌟 TÍNH NĂNG ƯU TIÊN: Sắp xếp người đầy đủ lên đầu bảng
        cleanedData.sort((a, b) => {
          if (a._hasWarning === b._hasWarning) return 0;
          return a._hasWarning ? 1 : -1; 
        });

        setDataPreview(
          cleanedData.map((row, index) => ({ ...row, key: index.toString() }))
        );

        const warnCount = cleanedData.filter(r => r._hasWarning).length;
        const validCount = cleanedData.length - warnCount;

        if (warnCount > 0) {
          message.warning(
            `Đọc file thành công! ${validCount} hợp lệ, ${warnCount} bản ghi thiếu thông tin (đã xếp xuống cuối).`
          );
        } else {
          message.success(`Đọc file thành công! ${cleanedData.length} bản ghi sẵn sàng phát hành.`);
        }
      } catch (error: any) {
        console.error(error);
        setDataPreview([]);
        message.error("Lỗi đọc file: " + (error.message || "Cấu trúc file không hợp lệ."));
      }
    };

    if (file.name.endsWith(".csv")) reader.readAsText(file, "UTF-8");
    else reader.readAsBinaryString(file);
    return false;
  };

  const validRows   = dataPreview.filter(r => !r._hasWarning);
  const invalidRows = dataPreview.filter(r => r._hasWarning);

  const handleSync = async () => {
    if (dataPreview.length === 0) return message.warning("Không có dữ liệu!");

    if (invalidRows.length > 0) {
      setShowSkipModal(true);
      return;
    }
    await submitData(validRows);
  };

const submitData = async (rows: any[]) => {
    setLoading(true);
    setShowSkipModal(false);
    try {
      // 1. Loại bỏ các trường nội bộ dư thừa
      const payload = rows.map(({ _missingFields, _hasWarning, key, ...rest }) => rest);

      // 2. TỰ ĐỘNG CHIA LÔ (CHUNKING)
      const CHUNK_SIZE = 400; // Mỗi lần gửi 400 người (An toàn tuyệt đối cho Blockchain)
      let totalSuccess = 0;
      let totalFailed = 0;
      let allErrors: string[] = [];

      // Vòng lặp cắt mảng dữ liệu để gửi lần lượt
      for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
        const chunk = payload.slice(i, i + CHUNK_SIZE);
        const currentBatch = Math.floor(i / CHUNK_SIZE) + 1;
        const totalBatches = Math.ceil(payload.length / CHUNK_SIZE);
        
        // Hiển thị thông báo trạng thái tiến độ cho người dùng
        message.loading({ 
          content: `Đang phát hành Lô ${currentBatch}/${totalBatches} (${chunk.length} văn bằng)... Vui lòng không đóng trình duyệt.`, 
          key: 'upload_progress',
          duration: 0 
        });

        // Gửi lô hiện tại lên API
        const res = await fetch("/api/certificates/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ certificatesList: chunk }),
        });
        const data = await res.json();

        if (data.success) {
          totalSuccess += data.data.successCount;
          totalFailed += data.data.failedCount;
          if (data.data.errors) {
            allErrors = [...allErrors, ...data.data.errors];
          }
        } else {
          throw new Error(data.error || `Lỗi không xác định ở lô thứ ${currentBatch}`);
        }
      }

      // Xóa thông báo loading
      message.destroy('upload_progress');

      // 3. TỔNG KẾT SAU KHI CHẠY XONG TẤT CẢ CÁC LÔ
      if (totalFailed > 0) {
        message.warning(
          `Hoàn tất: Phát hành thành công ${totalSuccess}, thất bại ${totalFailed}. Xem F12 Console để biết lý do.`
        );
        console.error("Danh sách lỗi phát hành:", allErrors);
      } else {
        message.success(`🎉 HOÀN TẤT: Đã phát hành TỔNG CỘNG ${totalSuccess} văn bằng lên Blockchain thành công!`);
      }
      
      setDataPreview([]);
      router.push("/dashboard");

    } catch (error: any) {
      message.destroy('upload_progress');
      message.error("Lỗi quá trình phát hành: " + error.message);
    } finally {
      setLoading(false);
    }
  };
  const columns = [
    {
      title: "",
      width: 40,
      fixed: "left" as const,
      render: (_: any, record: any) =>
        record._hasWarning ? (
          <Tooltip title={`Thiếu: ${record._missingFields.join(", ")}`}>
            <WarningOutlined style={{ color: "#faad14", fontSize: 16 }} />
          </Tooltip>
        ) : null,
    },
    { title: "STT", render: (_: any, __: any, index: number) => index + 1, width: 55, fixed: "left" as const },
    {
      title: "MSSV",
      dataIndex: "mssv",
      key: "mssv",
      width: 115,
      fixed: "left" as const,
      render: (val: string, record: any) => (
        <span style={{ color: record._hasWarning && !val ? "#ff4d4f" : undefined, fontWeight: 500 }}>
          {val || <i style={{ color: "#bbb" }}>— trống —</i>}
        </span>
      ),
    },
    {
      title: "Họ và tên",
      dataIndex: "fullName",
      key: "fullName",
      width: 180,
      fixed: "left" as const,
      render: (val: string, record: any) => (
        <span style={{ color: record._hasWarning && !val ? "#ff4d4f" : undefined }}>
          {val || <i style={{ color: "#bbb" }}>— trống —</i>}
        </span>
      ),
    },
    { title: "Ngày sinh",   dataIndex: "dob",          key: "dob",          width: 110 },
    { title: "Nơi sinh",    dataIndex: "pob",          key: "pob",          width: 110 },
    { title: "Giới tính",   dataIndex: "gender",       key: "gender",       width: 90  },
    { title: "Dân tộc",     dataIndex: "nation",       key: "nation",       width: 90  },
    { title: "Quốc tịch",   dataIndex: "nationality",  key: "nationality",  width: 100 },
    { title: "Lớp",         dataIndex: "className",    key: "className",    width: 130 },
    { title: "Khóa",        dataIndex: "khuaHoc",      key: "khuaHoc",      width: 100 },
    { title: "Ngành đào tạo", dataIndex: "major",      key: "major",        width: 220 },
    { title: "Điểm TB",     dataIndex: "gpa",          key: "gpa",          width: 100 },
    { title: "Xếp loại TN", dataIndex: "grade",        key: "grade",        width: 140 },
    { title: "Năm TN",      dataIndex: "namTotNghiep", key: "namTotNghiep", width: 90  },
    { title: "Số hiệu văn bằng", dataIndex: "soHieu",  key: "soHieu",       width: 140 },
    { title: "Số vào sổ",   dataIndex: "soVaoSo",      key: "soVaoSo",      width: 180 },
    { title: "Số QĐ",       dataIndex: "decisionNo",   key: "decisionNo",   width: 160 },
    { title: "Ngày ký",     dataIndex: "decisionDate", key: "decisionDate", width: 130 },
  ];

  return (
    <div className="p-8 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        <Title level={2} className="mb-8 text-center uppercase text-purple-700 tracking-wide">
          Phát hành văn bằng từ sổ gốc hàng loạt
        </Title>

        <Card variant="borderless" className="bg-gray-50 border-t-4 border-purple-600 mb-8 shadow-sm">
          <Dragger
            accept=".xlsx,.xls,.csv"
            beforeUpload={(file) => { handleFileUpload(file); return false; }}
            showUploadList={false}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ color: "#722ed1" }} />
            </p>
            <p className="ant-upload-text font-medium text-gray-600">
              Kéo thả file vào đây
            </p>
          </Dragger>
        </Card>

        {dataPreview.length > 0 && (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <Title level={4} style={{ margin: 0 }} className="text-gray-700">
                Xem trước dữ liệu ({dataPreview.length} bản ghi)
              </Title>
              <Tag color="green">{validRows.length} hợp lệ</Tag>
              {invalidRows.length > 0 && (
                <Tag color="warning" icon={<WarningOutlined />}>
                  {invalidRows.length} bản ghi thiếu thông tin
                </Tag>
              )}
              <div className="ml-auto">
                <Button
                  type="primary"
                  size="large"
                  icon={loading ? <SyncOutlined spin /> : <UploadOutlined />}
                  style={{ backgroundColor: "#722ed1" }}
                  onClick={handleSync}
                  loading={loading}
                  disabled={validRows.length === 0}
                >
                  Ký số & Phát hành {validRows.length} văn bằng hợp lệ
                </Button>
              </div>
            </div>

            <Table
              dataSource={dataPreview}
              columns={columns}
              pagination={{ pageSize: 15, showSizeChanger: true }}
              scroll={{ x: 2100 }}
              bordered
              size="small"
              className="shadow-sm"
              rowClassName={(record) => record._hasWarning ? "bg-yellow-50" : ""}
            />
          </div>
        )}

        <Modal
          title={
            <span>
              <WarningOutlined style={{ color: "#faad14", marginRight: 8 }} />
              {invalidRows.length} bản ghi bị thiếu thông tin bắt buộc
            </span>
          }
          open={showSkipModal}
          onOk={() => submitData(validRows)}
          onCancel={() => setShowSkipModal(false)}
          okText={`Bỏ qua và phát hành ${validRows.length} bản ghi hợp lệ`}
          cancelText="Quay lại kiểm tra"
          okButtonProps={{ style: { backgroundColor: "#722ed1" }, disabled: validRows.length === 0 }}
        >
          <p className="mb-2">Các bản ghi sau sẽ <strong>bị bỏ qua</strong> (không được phát hành lên Blockchain):</p>
          <ul className="text-sm max-h-48 overflow-y-auto pl-4">
            {invalidRows.map((r, i) => (
              <li key={i} className="mb-1">
                <strong>{r.fullName || r.mssv || `Dòng ${i + 1}`}</strong>
                {" — "}
                <span className="text-orange-600">Thiếu: {r._missingFields.join(", ")}</span>
              </li>
            ))}
          </ul>
        </Modal>
      </div>
    </div>
  );
}