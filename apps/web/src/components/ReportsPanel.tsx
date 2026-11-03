"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Typography,
  message,
} from "antd";
import { FileExcelOutlined, FilePdfOutlined } from "@ant-design/icons";
import { emptyRegisterFilters, registerParams } from "@/lib/diploma-register";
import {
  downloadReport,
  reportError,
  reportGrades,
  reportStatuses,
  type ReportFilters,
  type ReportGroup,
  type ReportOverview,
} from "@/lib/reports";

const initialFilters = (): ReportFilters => ({
  ...emptyRegisterFilters(),
  grade: "",
});
export default function ReportsPanel() {
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [report, setReport] = useState<ReportOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const request = useRef<AbortController | null>(null);
  async function load(next: ReportFilters) {
    if (next.issuedFrom && next.issuedTo && next.issuedFrom > next.issuedTo) {
      message.error("Ngày cấp từ phải trước hoặc bằng ngày cấp đến");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const response = await fetch(
        "/api/reports/overview?" + registerParams(next),
        { cache: "no-store", signal: controller.signal },
      );
      if (!response.ok) throw new Error(await reportError(response));
      const result: ReportOverview = await response.json();
      if (!controller.signal.aborted) {
        setReport(result);
        setApplied({ ...next });
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : "Chưa tải được báo cáo",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    void load(initialFilters());
    return () => request.current?.abort();
  }, []);
  async function exportFile(format: "xlsx" | "pdf") {
    if (exporting || loading || !report) return;
    setExporting(format);
    try {
      await downloadReport("statistics", format, applied);
      message.success("Đã xuất báo cáo thống kê");
    } catch (failure) {
      message.error(
        failure instanceof Error ? failure.message : "Không xuất được báo cáo",
      );
    } finally {
      setExporting(null);
    }
  }
  const columns = [
    {
      title: "Nhóm",
      dataIndex: "name",
      render: (value: string) => reportStatuses[value] || value,
    },
    { title: "Tổng", dataIndex: "total" },
    { title: "Đang hiệu lực", dataIndex: "active" },
    { title: "Đã thu hồi", dataIndex: "revoked" },
    { title: "Đã thay thế", dataIndex: "replaced" },
  ];
  const groups: {
    key: keyof Pick<
      ReportOverview,
      "byYear" | "byMajor" | "byGrade" | "byStatus"
    >;
    label: string;
  }[] = [
    { key: "byYear", label: "Theo năm" },
    { key: "byMajor", label: "Theo ngành" },
    { key: "byGrade", label: "Theo xếp loại" },
    { key: "byStatus", label: "Theo trạng thái" },
  ];
  return (
    <Card title="Báo cáo thống kê" className="mb-6">
      <Typography.Paragraph type="secondary">
        Thống kê văn bằng đã có giao dịch phát hành được xác nhận, gồm cả bản đã
        thu hồi hoặc thay thế. Không tính hồ sơ nháp và giao dịch đang chờ.
      </Typography.Paragraph>
      <Form
        layout="vertical"
        onFinish={() => void load(filters)}
        disabled={loading || !!exporting}
      >
        <Row gutter={[16, 0]}>
          <Col xs={24} sm={12} xl={8}>
            <Form.Item label="Năm tốt nghiệp">
              <InputNumber
                aria-label="Năm tốt nghiệp báo cáo"
                min={1900}
                max={2200}
                precision={0}
                style={{ width: "100%" }}
                value={filters.year ? Number(filters.year) : null}
                onChange={(value) =>
                  setFilters({
                    ...filters,
                    year: value == null ? "" : String(value),
                  })
                }
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} xl={8}>
            <Form.Item label="Ngành đào tạo">
              <Input
                aria-label="Ngành đào tạo báo cáo"
                maxLength={255}
                allowClear
                value={filters.major}
                onChange={(event) =>
                  setFilters({ ...filters, major: event.target.value })
                }
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} xl={8}>
            <Form.Item label="Xếp loại">
              <Select
                aria-label="Xếp loại báo cáo"
                allowClear
                placeholder="Tất cả xếp loại"
                value={filters.grade || undefined}
                options={reportGrades.map((value) => ({ value, label: value }))}
                onChange={(value) =>
                  setFilters({ ...filters, grade: value || "" })
                }
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} xl={8}>
            <Form.Item label="Trạng thái">
              <Select
                aria-label="Trạng thái báo cáo"
                allowClear
                placeholder="Tất cả trạng thái"
                value={filters.status || undefined}
                options={Object.entries(reportStatuses).map(
                  ([value, label]) => ({ value, label }),
                )}
                onChange={(value) =>
                  setFilters({ ...filters, status: value || "" })
                }
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} xl={8}>
            <Form.Item label="Ngày cấp từ">
              <Input
                aria-label="Ngày cấp từ báo cáo"
                type="date"
                value={filters.issuedFrom}
                onChange={(event) =>
                  setFilters({ ...filters, issuedFrom: event.target.value })
                }
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} xl={8}>
            <Form.Item label="Ngày cấp đến">
              <Input
                aria-label="Ngày cấp đến báo cáo"
                type="date"
                value={filters.issuedTo}
                onChange={(event) =>
                  setFilters({ ...filters, issuedTo: event.target.value })
                }
              />
            </Form.Item>
          </Col>
        </Row>
        <Space wrap className="mb-4">
          <Button type="primary" htmlType="submit" loading={loading}>
            Xem báo cáo
          </Button>
          <Button
            onClick={() => {
              const cleared = initialFilters();
              setFilters(cleared);
              void load(cleared);
            }}
          >
            Xóa bộ lọc
          </Button>
        </Space>
      </Form>
      {error && (
        <Alert
          type="error"
          showIcon
          title="Chưa tải được báo cáo"
          description={error}
          className="mb-4"
        />
      )}
      <Row gutter={[16, 16]} className="mb-4">
        {[
          ["Tổng văn bằng", "total"],
          ["Đang hiệu lực", "active"],
          ["Đã thu hồi", "revoked"],
          ["Đã thay thế", "replaced"],
        ].map(([label, key]) => (
          <Col xs={12} lg={6} key={key}>
            <Statistic
              title={label}
              value={
                report?.summary[key as keyof ReportOverview["summary"]] ?? "—"
              }
            />
          </Col>
        ))}
      </Row>
      {report && (
        <Typography.Paragraph type="secondary">
          {report.filters} · Cập nhật:{" "}
          {new Date(report.generatedAt).toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
          })}
        </Typography.Paragraph>
      )}
      <Space wrap className="mb-3">
        <Button
          icon={<FileExcelOutlined />}
          aria-label="Xuất báo cáo Excel"
          loading={exporting === "xlsx"}
          disabled={!report || loading || !!exporting}
          onClick={() => void exportFile("xlsx")}
        >
          Xuất báo cáo Excel
        </Button>
        <Button
          icon={<FilePdfOutlined />}
          aria-label="Xuất báo cáo PDF"
          loading={exporting === "pdf"}
          disabled={!report || loading || !!exporting}
          onClick={() => void exportFile("pdf")}
        >
          Xuất báo cáo PDF
        </Button>
      </Space>
      <Tabs
        items={groups.map((group) => ({
          key: group.key,
          label: group.label,
          children: (
            <Table<ReportGroup>
              rowKey="name"
              size="small"
              loading={loading}
              columns={columns}
              dataSource={report?.[group.key] || []}
              scroll={{ x: 600 }}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              locale={{
                emptyText: error
                  ? "Chưa tải được dữ liệu"
                  : "Không có văn bằng phù hợp",
              }}
            />
          ),
        }))}
      />
    </Card>
  );
}
