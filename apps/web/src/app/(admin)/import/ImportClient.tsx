"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Không xử lý được yêu cầu");
  return result;
}
export default function ImportClient() {
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null),
    [batches, setBatches] = useState<any[]>([]),
    [batchId, setBatchId] = useState("");
  const [rows, setRows] = useState<any[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [status, setStatus] = useState("NEEDS_REVIEW");
  const [programs, setPrograms] = useState<any[]>([]);
  const [reviewRow, setReviewRow] = useState<any>(null),
    [corrections, setCorrections] = useState("{}"),
    [note, setNote] = useState("");
  async function refreshBatches() {
    const result = await api("/api/imports?limit=100");
    setBatches(result.data);
  }
  async function refreshRows(id = batchId, selectedPage = page) {
    if (!id) return;
    const result = await api(
      "/api/imports/" +
        id +
        "/rows?page=" +
        selectedPage +
        "&limit=20" +
        (status ? "&status=" + status : ""),
    );
    setRows(result.data);
    setTotal(result.total);
  }
  useEffect(() => {
    refreshBatches().catch((error) => message.error(error.message));
    api("/api/imports/programs")
      .then(setPrograms)
      .catch((error) => message.error(error.message));
  }, []);
  useEffect(() => {
    refreshRows().catch((error) => message.error(error.message));
  }, [batchId, page, status]);
  async function upload(stage: boolean) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await api(
        "/api/imports/registry" + (stage ? "" : "/preview"),
        { method: "POST", body: form },
      );
      if (stage) {
        setBatchId(result.batchId);
        setPage(1);
        await refreshBatches();
        await refreshRows(result.batchId, 1);
        message.success(
          result.reused
            ? "File đã có trong staging; không tạo bản sao"
            : "Đã staging. Chưa tạo văn bằng hay ghi blockchain.",
        );
      } else setPreview(result);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function review() {
    setBusy(true);
    try {
      const changes = JSON.parse(corrections);
      const result = await api(
        "/api/imports/" + batchId + "/rows/" + reviewRow.id,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ corrections: changes, note }),
        },
      );
      if (!result.ready) {
        message.error(
          "Dữ liệu vẫn còn lỗi: " +
            result.issues
              .filter((issue: any) => issue.severity === "ERROR")
              .map((issue: any) => issue.message)
              .join("; "),
        );
      } else {
        message.success("Đã rà soát và ghi audit");
        setReviewRow(null);
      }
      await refreshRows();
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    try {
      const result = await api("/api/imports/" + batchId + "/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      message.success(
        "Đã nhập " +
          result.imported +
          " hồ sơ, " +
          result.diplomas +
          " văn bằng DRAFT; " +
          result.conflicts +
          " xung đột.",
      );
      await refreshRows();
      await refreshBatches();
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="p-6 space-y-5">
      <Typography.Title level={3}>Nhập và đối soát sổ gốc</Typography.Title>
      <Alert
        type="info"
        showIcon
        message="File gốc → staging → rà soát → hồ sơ tốt nghiệp → bản nháp văn bằng"
        description="Không suy MSSV/ngành/xếp loại, không gán GPA mặc định, không lấy ngày ký quyết định làm ngày cấp. Văn bằng chỉ neo blockchain sau phê duyệt độc lập."
      />
      <Card title="1. Đọc file .xlsx (tối đa 5 MB)">
        <Space wrap>
          <Upload
            accept=".xlsx"
            maxCount={1}
            beforeUpload={(selected) => {
              setFile(selected);
              setPreview(null);
              return false;
            }}
            onRemove={() => setFile(null)}
          >
            <Button>Chọn file</Button>
          </Upload>
          <Button disabled={!file} loading={busy} onClick={() => upload(false)}>
            Kiểm tra không ghi dữ liệu
          </Button>
          <Button
            type="primary"
            disabled={!file}
            loading={busy}
            onClick={() => upload(true)}
          >
            Lưu file và staging
          </Button>
        </Space>
        {preview && (
          <div className="mt-4">
            <Typography.Text strong>
              {preview.summary.total} dòng; {preview.summary.ready} READY;{" "}
              {preview.summary.needsReview} cần rà soát
            </Typography.Text>
            <Table
              rowKey="sheetName"
              pagination={false}
              className="mt-3"
              dataSource={Object.entries(preview.summary.bySheet).map(
                ([sheetName, value]: any) => ({ sheetName, ...value }),
              )}
              columns={[
                { title: "Sheet", dataIndex: "sheetName" },
                { title: "Dòng", dataIndex: "total" },
                { title: "Lỗi (issue)", dataIndex: "errors" },
                { title: "Cảnh báo (issue)", dataIndex: "warnings" },
              ]}
            />
          </div>
        )}
      </Card>
      <Card title="2. Rà soát và commit hồ sơ">
        <Space wrap className="mb-4">
          <Select
            style={{ minWidth: 340 }}
            placeholder="Chọn batch"
            value={batchId || undefined}
            onChange={(value) => {
              setBatchId(value);
              setPage(1);
            }}
            options={batches.map((batch) => ({
              value: batch.id,
              label:
                batch.document.fileName +
                " — " +
                batch.status +
                " (" +
                batch.importedRows +
                "/" +
                batch.totalRows +
                ")",
            }))}
          />
          <Select
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
              { value: "", label: "Tất cả dòng" },
              ...["NEEDS_REVIEW", "READY", "IMPORTED", "SKIPPED"].map(
                (value) => ({ value, label: value }),
              ),
            ]}
          />
          <Popconfirm
            title="Chỉ commit dòng READY?"
            description="Sẽ tạo hồ sơ và bản nháp, không tạo tài khoản/anchor."
            onConfirm={commit}
          >
            <Button type="primary" disabled={!batchId} loading={busy}>
              Commit các dòng READY
            </Button>
          </Popconfirm>
        </Space>
        <Table
          rowKey="id"
          scroll={{ x: 1000 }}
          dataSource={rows}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            showSizeChanger: false,
            onChange: setPage,
          }}
          columns={[
            {
              title: "Nguồn",
              key: "source",
              width: 110,
              render: (_: any, row: any) => row.sheetName + "!" + row.rowNumber,
            },
            {
              title: "MSSV",
              key: "code",
              render: (_: any, row: any) =>
                row.overrides?.studentCode ||
                row.normalizedData.studentCode ||
                "Chưa xác định",
            },
            {
              title: "Họ tên",
              key: "name",
              render: (_: any, row: any) => row.normalizedData.fullName,
            },
            {
              title: "Trạng thái",
              dataIndex: "status",
              render: (value: string) => (
                <Tag
                  color={
                    value === "IMPORTED"
                      ? "green"
                      : value === "READY"
                        ? "blue"
                        : "orange"
                  }
                >
                  {value}
                </Tag>
              ),
            },
            {
              title: "Issue đang mở",
              key: "issues",
              render: (_: any, row: any) =>
                row.issues
                  .filter((issue: any) => !issue.resolvedAt)
                  .map((issue: any) => (
                    <Tag
                      key={issue.id}
                      color={issue.severity === "ERROR" ? "red" : "orange"}
                    >
                      {issue.code}
                    </Tag>
                  )),
            },
            {
              title: "Thao tác",
              key: "action",
              render: (_: any, row: any) => (
                <Button
                  disabled={["IMPORTED", "SKIPPED"].includes(row.status)}
                  onClick={() => {
                    setReviewRow(row);
                    setCorrections(
                      JSON.stringify(
                        { ...row.normalizedData, ...row.overrides },
                        null,
                        2,
                      ),
                    );
                    setNote("");
                  }}
                >
                  Rà soát
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={
          reviewRow
            ? "Rà soát " + reviewRow.sheetName + "!" + reviewRow.rowNumber
            : "Rà soát"
        }
        open={!!reviewRow}
        onCancel={() => setReviewRow(null)}
        onOk={review}
        okText="Kiểm tra và lưu override"
        confirmLoading={busy}
        width={900}
      >
        <Alert
          type="warning"
          showIcon
          message="Chỉ ghi correction có căn cứ hồ sơ. Raw source không bị sửa."
          className="mb-3"
        />
        {reviewRow?.issues
          .filter((issue: any) => !issue.resolvedAt)
          .map((issue: any) => (
            <div key={issue.id}>
              <Tag color={issue.severity === "ERROR" ? "red" : "orange"}>
                {issue.code}
              </Tag>
              {issue.message}
            </div>
          ))}
        <Typography.Paragraph className="mt-3">
          Corrections JSON: programId là UUID ngành đã được nhà trường phê
          duyệt. Ngày ở dạng YYYY-MM-DD; GPA để null nếu nguồn không có.
        </Typography.Paragraph>
        <Select
          className="w-full mb-3"
          showSearch
          placeholder="Chọn ngành đã xác nhận để đặt programId"
          options={programs.map((program) => ({
            value: program.id,
            label: program.name + " (" + program.code + ")",
          }))}
          onChange={(value) => {
            try {
              const data = JSON.parse(corrections);
              data.programId = value;
              setCorrections(JSON.stringify(data, null, 2));
            } catch {
              message.error("Corrections JSON chưa hợp lệ");
            }
          }}
        />
        <Input.TextArea
          rows={16}
          value={corrections}
          onChange={(event) => setCorrections(event.target.value)}
          className="font-mono"
        />
        <Input.TextArea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ghi rõ nguồn đối chiếu/lý do xác nhận (bắt buộc)"
          className="mt-3"
        />
      </Modal>
    </div>
  );
}
