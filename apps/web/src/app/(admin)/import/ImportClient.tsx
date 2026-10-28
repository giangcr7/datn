"use client";

import PageTitle from "@/components/PageTitle";
import { openRegistryAssistant } from "@/lib/diploma-assistant";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Input,
  InputNumber,
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
import {
  UploadOutlined,
  FileSearchOutlined,
  SaveOutlined,
  ReloadOutlined,
  ArrowRightOutlined,
  EditOutlined,
} from "@ant-design/icons";
import {
  openRegistryIssues,
  registryBatchSummaryText,
  registryIssueText,
} from "@/lib/registry-review";

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Không xử lý được yêu cầu");
  return result;
}
export default function ImportClient({
  initialBatchId = "",
  initialStatus = "NEEDS_REVIEW",
  initialRowId = "",
}: {
  initialBatchId?: string;
  initialStatus?: string;
  initialRowId?: string;
}) {
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null),
    [batches, setBatches] = useState<any[]>([]),
    [batchId, setBatchId] = useState(initialBatchId);
  const [rows, setRows] = useState<any[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(initialStatus);
  const [rowId, setRowId] = useState(initialRowId);
  const [programs, setPrograms] = useState<any[]>([]);
  const [originType, setOriginType] = useState<"DIGITIZATION" | "ISSUANCE">(
    "ISSUANCE",
  );
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
        (status ? "&status=" + status : "") +
        (rowId ? "&rowId=" + encodeURIComponent(rowId) : ""),
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
  }, [batchId, page, status, rowId]);
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
        setRowId("");
        setBatchId(result.batchId);
        setPage(1);
        await refreshBatches();
        await refreshRows(result.batchId, 1);
        message.success(
          result.reused
            ? "File đã có trong khu vực rà soát; không tạo bản sao"
            : "Đã lưu file để rà soát. Chưa duyệt phát hành.",
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
      const values = JSON.parse(corrections);
      const changes =
        reviewRow.status === "IMPORTED"
          ? Object.fromEntries(
              Object.entries(values).filter(([field]) =>
                [
                  "degreeType",
                  "issuedOn",
                  "fullNameLatin",
                  "majorNameEn",
                  "issuePlace",
                  "diplomaSignerName",
                  "diplomaSignerTitle",
                ].includes(field),
              ),
            )
          : values;
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
        message.success("Đã kiểm tra đủ thông tin cấp bằng và lưu đối soát");
        setReviewRow(null);
      }
      await refreshRows();
      await refreshBatches();
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
        body: JSON.stringify({ originType }),
      });
      const notify =
        result.conflicts || (result.imported > 0 && result.diplomas === 0)
          ? message.warning
          : message.success;
      notify(
        "Đã lưu " +
          result.imported +
          " hồ sơ; tạo " +
          result.diplomas +
          " văn bằng nháp để duyệt phát hành; " +
          result.conflicts +
          " xung đột." +
          (result.imported > 0 && result.diplomas === 0
            ? " Các hồ sơ vừa lưu chưa có số hiệu và số vào sổ nên chưa có văn bằng để duyệt phát hành."
            : ""),
      );
      await refreshRows();
      await refreshBatches();
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setBusy(false);
    }
  }
  const correctionValues = JSON.parse(corrections || "{}") as Record<
    string,
    any
  >;
  async function recheck() {
    setBusy(true);
    try {
      const result = await api("/api/imports/" + batchId + "/recheck", {
        method: "POST",
      });
      await refreshRows();
      await refreshBatches();
      const notify = result.needsReviewRows ? message.warning : message.success;
      notify(
        "Đã khôi phục thông tin cho " +
          (result.repairedDrafts || 0) +
          " hồ sơ nháp; " +
          result.readyRows +
          " dòng đủ điều kiện lưu, " +
          (result.needsReviewRows || 0) +
          " dòng cần bổ sung.",
      );
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setBusy(false);
    }
  }
  function changeCorrection(field: string, value: unknown) {
    setCorrections(
      JSON.stringify({ ...correctionValues, [field]: value }, null, 2),
    );
  }
  const selectedBatch = batches.find((batch) => batch.id === batchId);
  const batchSummary = selectedBatch?.reviewSummary;
  return (
    <div className="workspace-page space-y-5">
      <PageTitle>Kiểm tra dữ liệu</PageTitle>
      <section className="border-t border-gray-200 py-4">
        <Typography.Title level={4}>Nhập file Excel</Typography.Title>
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
            <Button icon={<UploadOutlined />}>Chọn file .xlsx</Button>
          </Upload>
          <Button
            icon={<FileSearchOutlined />}
            disabled={!file}
            loading={busy}
            onClick={() => upload(false)}
          >
            Xem trước
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            disabled={!file}
            loading={busy}
            onClick={() => upload(true)}
          >
            Nhập để kiểm tra
          </Button>
        </Space>
        {preview && (
          <div className="mt-4">
            <Typography.Text strong>
              {preview.summary.total} dòng; {preview.summary.ready} hợp lệ;{" "}
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
                { title: "Lỗi cần sửa", dataIndex: "errors" },
                { title: "Lưu ý cần kiểm tra", dataIndex: "warnings" },
              ]}
            />
          </div>
        )}
      </section>
      <section className="border-t border-gray-200 py-4">
        <Typography.Title level={4}>Kiểm tra và lưu hồ sơ</Typography.Title>
        <Space wrap className="mb-4">
          <Select
            style={{ width: 400, maxWidth: "100%" }}
            placeholder="Chọn đợt rà soát"
            value={batchId || undefined}
            onChange={(value) => {
              setBatchId(value);
              setRowId("");
              setPage(1);
            }}
            options={batches.map((batch) => ({
              value: batch.id,
              label:
                batch.document.fileName +
                " — " +
                (
                  {
                    READY: "Dữ liệu hợp lệ",
                    REVIEW_REQUIRED: "Còn dòng cần rà soát",
                    COMPLETED: "Đã hoàn tất lưu hồ sơ",
                  } as Record<string, string>
                )[batch.status] +
                " (đã lưu " +
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
              setRowId("");
              setPage(1);
            }}
            options={[
              { value: "", label: "Tất cả dòng" },
              ...["NEEDS_REVIEW", "READY", "IMPORTED", "SKIPPED"].map(
                (value) => ({
                  value,
                  label: (
                    {
                      NEEDS_REVIEW: "Cần rà soát",
                      READY: "Đủ thông tin, chờ lưu",
                      IMPORTED: "Đã kiểm tra và lưu",
                      SKIPPED: "Đã bỏ qua",
                    } as Record<string, string>
                  )[value],
                }),
              ),
            ]}
          />
          <Button
            icon={<ReloadOutlined />}
            title="Kiểm tra lại dữ liệu"
            aria-label="Kiểm tra lại dữ liệu"
            disabled={!batchId || busy}
            onClick={recheck}
          />
        </Space>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span>Cách tạo hồ sơ:</span>
          <Select
            aria-label="Cách tạo hồ sơ"
            value={originType}
            onChange={setOriginType}
            disabled={busy}
            style={{ width: 190 }}
            options={[
              { value: "ISSUANCE", label: "Thêm mới" },
              { value: "DIGITIZATION", label: "Số hóa dữ liệu" },
            ]}
          />
          <Popconfirm
            title="Lưu các dòng đã kiểm tra hợp lệ trong đợt này?"
            description="Chỉ lưu hồ sơ đã rà soát. Chưa duyệt phát hành và chưa ghi blockchain."
            onConfirm={commit}
          >
            <Button
              type="primary"
              disabled={!batchId || batchSummary?.readyRows === 0}
              loading={busy}
            >
              Lưu hồ sơ hợp lệ
            </Button>
          </Popconfirm>
          {!!batchSummary?.draftRows && (
            <Button
              icon={<ArrowRightOutlined />}
              href={
                batchId
                  ? "/issue?batchId=" + encodeURIComponent(batchId)
                  : "/issue"
              }
              disabled={!batchId || busy || batchSummary?.draftRows === 0}
            >
              {batchSummary
                ? `Sang duyệt phát hành (${batchSummary.draftRows} hồ sơ)`
                : "Sang duyệt phát hành văn bằng"}
            </Button>
          )}
        </div>
        {batchSummary && (
          <Alert
            className="mb-4"
            type="info"
            title={registryBatchSummaryText(batchSummary)}
          />
        )}
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
              render: (_: any, row: any) =>
                row.overrides?.fullName || row.normalizedData.fullName,
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
                  {(
                    {
                      NEEDS_REVIEW: "Cần rà soát",
                      READY: "Đủ thông tin, chờ lưu",
                      IMPORTED: "Đã kiểm tra và lưu",
                      SKIPPED: "Đã bỏ qua",
                    } as Record<string, string>
                  )[value] || value}
                </Tag>
              ),
            },
            {
              title: "Lưu ý",
              key: "issues",
              width: 320,
              render: (_: any, row: any) => {
                const issues =
                  row.status === "IMPORTED"
                    ? (row.submissionIssues || []).map(
                        (message: string, index: number) => ({
                          id: index,
                          code: "SUBMISSION",
                          severity: "ERROR",
                          message,
                        }),
                      )
                    : openRegistryIssues(row.issues);
                return issues.length ? (
                  <div>
                    <ul className="m-0 list-disc space-y-1 pl-4">
                      {issues.map((issue: any) => (
                        <li
                          key={issue.id}
                          style={{
                            color:
                              issue.severity === "ERROR"
                                ? "#b42318"
                                : "#595959",
                          }}
                        >
                          {registryIssueText(issue)}
                        </li>
                      ))}
                    </ul>
                    <Button
                      type="link"
                      size="small"
                      onClick={() =>
                        openRegistryAssistant(
                          issues.map((issue: { code: string }) => issue.code),
                        )
                      }
                    >
                      Giải thích lỗi
                    </Button>
                  </div>
                ) : (
                  <Typography.Text type="success">
                    Đủ thông tin cấp bằng
                  </Typography.Text>
                );
              },
            },
            {
              title: "Thao tác",
              key: "action",
              render: (_: any, row: any) => (
                <Button
                  icon={<EditOutlined />}
                  disabled={
                    row.status === "SKIPPED" ||
                    (row.status === "IMPORTED" &&
                      (!row.graduation?.diplomas?.length ||
                        row.graduation.diplomas.some(
                          (diploma: any) =>
                            diploma.workflowStatus !== "DRAFT" ||
                            diploma.status !== "DRAFT" ||
                            diploma.pdfSignatureCount > 0,
                        )))
                  }
                  onClick={() => {
                    setReviewRow(row);
                    const diploma = row.graduation?.diplomas?.[0];
                    setCorrections(
                      JSON.stringify(
                        row.status === "IMPORTED"
                          ? {
                              ...row.normalizedData,
                              ...row.overrides,
                              ...Object.fromEntries(
                                Object.entries(
                                  diploma?.printedDiploma || {},
                                ).filter(
                                  ([, value]) =>
                                    value !== null &&
                                    value !== undefined &&
                                    value !== "",
                                ),
                              ),
                              degreeType:
                                diploma?.degreeType ||
                                row.overrides?.degreeType ||
                                row.normalizedData.degreeType,
                              issuedOn:
                                diploma?.issueDate ||
                                row.overrides?.issuedOn ||
                                row.normalizedData.issuedOn ||
                                "",
                            }
                          : { ...row.normalizedData, ...row.overrides },
                        null,
                        2,
                      ),
                    );
                    setNote("");
                  }}
                >
                  {row.status === "IMPORTED" ? "Kiểm tra thông tin" : "Bổ sung"}
                </Button>
              ),
            },
          ]}
        />
      </section>
      <Modal
        title={
          reviewRow
            ? "Kiểm tra dữ liệu " +
              reviewRow.sheetName +
              "!" +
              reviewRow.rowNumber
            : "Kiểm tra dữ liệu"
        }
        open={!!reviewRow}
        onCancel={() => setReviewRow(null)}
        onOk={review}
        okText="Kiểm tra và lưu đối soát"
        confirmLoading={busy}
        width={900}
      >
        <Alert
          type="warning"
          showIcon
          title={
            reviewRow?.status === "IMPORTED"
              ? "Chỉ sửa thông tin cấp bằng của hồ sơ nháp chưa ký, chưa phát hành."
              : "Chỉ điều chỉnh khi có căn cứ hồ sơ. File nguồn luôn được giữ nguyên."
          }
          className="mb-3"
        />
        {(reviewRow?.status === "IMPORTED"
          ? (reviewRow.submissionIssues || []).map(
              (message: string, index: number) => ({
                id: index,
                message,
                severity: "ERROR",
              }),
            )
          : openRegistryIssues(reviewRow?.issues)
        ).map((issue: any) => (
          <div key={issue.id}>
            <Tag color={issue.severity === "ERROR" ? "red" : "orange"}>
              {issue.severity === "ERROR" ? "Cần sửa" : "Lưu ý"}
            </Tag>
            {registryIssueText(issue)}
          </div>
        ))}
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          {reviewRow?.status !== "IMPORTED" && (
            <>
              {[
                ["studentCode", "Mã sinh viên"],
                ["fullName", "Họ và tên"],
                ["birthPlace", "Nơi sinh"],
                ["ethnicity", "Dân tộc"],
                ["nationality", "Quốc tịch"],
                ["classCode", "Lớp"],
                ["cohortCode", "Khóa học"],
                ["specialization", "Chuyên ngành"],
                ["certificateNo", "Số hiệu văn bằng"],
                ["registryNo", "Số vào sổ"],
                ["decisionNumber", "Số quyết định"],
                ["signerName", "Người ký quyết định"],
              ].map(([field, label]) => (
                <label key={field} className="flex flex-col gap-1">
                  <span>{label}</span>
                  <Input
                    value={correctionValues[field] || ""}
                    onChange={(event) =>
                      changeCorrection(field, event.target.value)
                    }
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1">
                <span>Giới tính</span>
                <Select
                  allowClear
                  value={correctionValues.gender || undefined}
                  options={[
                    { value: "MALE", label: "Nam" },
                    { value: "FEMALE", label: "Nữ" },
                    { value: "OTHER", label: "Khác" },
                  ]}
                  onChange={(value) =>
                    changeCorrection("gender", value || null)
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Loại bằng</span>
                <Select
                  allowClear
                  value={correctionValues.degreeType || undefined}
                  placeholder="Không suy loại bằng từ tên ngành"
                  options={[
                    { value: "BACHELOR", label: "Bằng cử nhân" },
                    { value: "ENGINEER", label: "Bằng kỹ sư" },
                    { value: "MASTER", label: "Bằng thạc sĩ" },
                    { value: "DOCTOR", label: "Bằng tiến sĩ" },
                    { value: "OTHER", label: "Loại khác" },
                  ]}
                  onChange={(value) =>
                    changeCorrection("degreeType", value || null)
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Ngành đã xác nhận</span>
                <Select
                  showSearch
                  optionFilterProp="label"
                  value={correctionValues.programId || undefined}
                  options={programs.map((program) => ({
                    value: program.id,
                    label: program.name + " (" + program.code + ")",
                  }))}
                  onChange={(value) => {
                    const program = programs.find((item) => item.id === value);
                    setCorrections(
                      JSON.stringify({
                        ...correctionValues,
                        programId: value,
                        majorNameEn: program?.nameEn || null,
                      }),
                    );
                  }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Năm tốt nghiệp</span>
                <InputNumber
                  className="w-full"
                  min={1900}
                  max={new Date().getFullYear()}
                  value={correctionValues.graduationYear}
                  onChange={(value) =>
                    changeCorrection("graduationYear", value)
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Xếp loại theo hồ sơ</span>
                <Select
                  value={correctionValues.classification || undefined}
                  options={[
                    { value: "AVERAGE", label: "Trung bình" },
                    { value: "AVERAGE_GOOD", label: "Trung bình khá" },
                    { value: "GOOD", label: "Khá" },
                    { value: "VERY_GOOD", label: "Giỏi" },
                    { value: "EXCELLENT", label: "Xuất sắc" },
                  ]}
                  onChange={(value) =>
                    changeCorrection("classification", value)
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Thang điểm</span>
                <Select
                  value={correctionValues.gpaScale}
                  options={[
                    { value: 4, label: "Hệ 4" },
                    { value: 10, label: "Hệ 10" },
                  ]}
                  onChange={(value) => changeCorrection("gpaScale", value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>GPA (để trống nếu nguồn không có)</span>
                <InputNumber
                  className="w-full"
                  min={0}
                  max={correctionValues.gpaScale || 4}
                  value={correctionValues.gpa}
                  onChange={(value) => changeCorrection("gpa", value)}
                />
              </label>
            </>
          )}
          {(reviewRow?.status === "IMPORTED"
            ? [["issuedOn", "Ngày cấp thực tế đã đối chiếu"]]
            : [
                ["dateOfBirth", "Ngày sinh"],
                ["decisionDate", "Ngày ký quyết định"],
                ["issuedOn", "Ngày cấp thực tế đã đối chiếu"],
              ]
          ).map(([field, label]) => (
            <label key={field} className="flex flex-col gap-1">
              <span>{label}</span>
              <Input
                type="date"
                value={correctionValues[field] || ""}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) =>
                  changeCorrection(field, event.target.value || null)
                }
              />
            </label>
          ))}
          {[
            ["fullNameLatin", "Họ tên trang tiếng Anh", 255],
            ["majorNameEn", "Tên ngành tiếng Anh", 255],
            ["issuePlace", "Nơi cấp trên bằng", 120],
            ["diplomaSignerName", "Người ký trên bằng", 255],
            ["diplomaSignerTitle", "Chức danh người ký bằng", 120],
          ].map(([field, label, maximum]) => (
            <label key={String(field)} className="flex flex-col gap-1">
              <span>{label}</span>
              <Input
                value={correctionValues[String(field)] || ""}
                maxLength={Number(maximum)}
                onChange={(event) =>
                  changeCorrection(String(field), event.target.value || null)
                }
              />
            </label>
          ))}
          {reviewRow?.status === "IMPORTED" && (
            <label className="flex flex-col gap-1">
              <span>Loại bằng</span>
              <Select
                value={correctionValues.degreeType || undefined}
                options={[
                  { value: "BACHELOR", label: "Bằng cử nhân" },
                  { value: "ENGINEER", label: "Bằng kỹ sư" },
                  { value: "MASTER", label: "Bằng thạc sĩ" },
                  { value: "DOCTOR", label: "Bằng tiến sĩ" },
                  { value: "OTHER", label: "Loại khác" },
                ]}
                onChange={(value) => changeCorrection("degreeType", value)}
              />
            </label>
          )}
        </div>
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
