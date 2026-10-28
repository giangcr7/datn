"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Input,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckOutlined,
  EyeOutlined,
  ReloadOutlined,
  FileSearchOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import {
  canSelectWorkflowDiploma,
  processWorkflowSelection,
  workflowJson,
  type DiplomaWorkflowAction,
  type WorkflowDiploma,
  type WorkflowPage,
  type WorkflowResult,
} from "@/lib/diploma-workflow";
import { getWorkspaceKind, type WorkspaceUser } from "@/lib/workspace-access";
import {
  registryBatchSummaryText,
  type RegistryBatchSummary,
} from "@/lib/registry-review";
import { degreeOptions } from "./DiplomaPrintDataEditor";
import NewDiplomaRequest from "./NewDiplomaRequest";

interface BatchOption {
  value: string;
  label: string;
  reviewSummary?: RegistryBatchSummary;
}
interface ActionDialog {
  action: DiplomaWorkflowAction;
  records: WorkflowDiploma[];
}

const actionLabels = {
  submit: "Duyệt và phát hành",
  approve: "Duyệt và phát hành",
  reject: "Từ chối",
};
const resultLabels: Record<string, string> = {
  PENDING: "Chờ xử lý nội bộ",
  ANCHOR_PENDING: "Đã duyệt, chờ blockchain",
  REJECTED: "Đã từ chối",
};

function registryReviewHref(record: WorkflowDiploma) {
  const params = new URLSearchParams({
    batchId: record.sourceBatchId || "",
    status: "IMPORTED",
  });
  if (record.sourceRowId) params.set("rowId", record.sourceRowId);
  return "/import?" + params.toString();
}

export default function DiplomaWorkflowWorkspace({
  mode,
  user,
  initialBatchId = "",
}: {
  mode: "prepare" | "pending";
  user?: WorkspaceUser;
  initialBatchId?: string;
}) {
  const prepare = mode === "prepare";
  const canApprove = getWorkspaceKind(user) === "approver";
  const canAct = canApprove;
  const [data, setData] = useState<WorkflowDiploma[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [batchId, setBatchId] = useState(initialBatchId);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const records = useRef(new Map<string, WorkflowDiploma>());
  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState<WorkflowDiploma | null>(null);
  const [results, setResults] = useState<WorkflowResult[]>([]);
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const disabled = busy || selecting;
  const endpoint = prepare ? "/api/cert/candidates" : "/api/cert/pending";

  function query(selectedPage: number, limit: number) {
    const params = new URLSearchParams({
      page: String(selectedPage),
      limit: String(limit),
      search,
    });
    if (batchId) params.set("batchId", batchId);
    return endpoint + "?" + params.toString();
  }

  useEffect(() => {
    if (!prepare) return;
    workflowJson<{
      data: {
        id: string;
        document: { fileName: string };
        reviewSummary?: RegistryBatchSummary;
      }[];
    }>("/api/imports?limit=100")
      .then((result) =>
        setBatches(
          result.data.map((batch) => ({
            value: batch.id,
            label: batch.document.fileName + " · " + batch.id.slice(0, 8),
            reviewSummary: batch.reviewSummary,
          })),
        ),
      )
      .catch((error: Error) => message.error(error.message));
  }, [prepare, revision]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
      search,
    });
    if (batchId) params.set("batchId", batchId);
    setLoading(true);
    workflowJson<WorkflowPage>(endpoint + "?" + params.toString(), {
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result.data);
        setTotal(result.pagination.total);
        for (const record of result.data)
          records.current.set(record.uuid, record);
        const lastPage = Math.max(1, result.pagination.totalPages);
        if (page > lastPage) setPage(lastPage);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) {
          setData([]);
          message.error(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, page, pageSize, search, batchId, revision]);

  async function selectAll() {
    if (total > 10000) {
      message.warning(
        "Tối đa 10.000 hồ sơ mỗi lượt; hãy lọc theo đợt hoặc từ khóa.",
      );
      return;
    }
    setSelecting(true);
    try {
      const all = new Map<string, WorkflowDiploma>();
      let selectedPage = 1;
      let totalPages = 1;
      do {
        const result = await workflowJson<WorkflowPage>(
          query(selectedPage, 100),
        );
        totalPages = result.pagination.totalPages;
        if (result.pagination.total > 10000)
          throw new Error("Quá 10.000 hồ sơ; vui lòng thu hẹp bộ lọc");
        for (const record of result.data) {
          records.current.set(record.uuid, record);
          if (canSelectWorkflowDiploma(record, mode, user?.id))
            all.set(record.uuid, record);
        }
        selectedPage++;
      } while (selectedPage <= totalPages);
      setSelectedIds([...all.keys()]);
      message.info(
        "Đã chọn " +
          all.size +
          (prepare
            ? " hồ sơ đủ điều kiện phát hành."
            : " hồ sơ đủ điều kiện phê duyệt."),
      );
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không chọn được hồ sơ",
      );
    } finally {
      setSelecting(false);
    }
  }

  function openAction(action: DiplomaWorkflowAction, ids: string[]) {
    const selected = ids
      .map((uuid) => records.current.get(uuid))
      .filter((record): record is WorkflowDiploma => !!record);
    if (!selected.length) {
      message.warning("Vui lòng chọn hồ sơ");
      return;
    }
    if (
      prepare &&
      action !== "reject" &&
      selected.some(
        (record) => !canSelectWorkflowDiploma(record, mode, user?.id),
      )
    ) {
      message.warning(
        "Có hồ sơ chưa đủ điều kiện phát hành. Cần bổ sung thông tin đã xác nhận trước.",
      );
      return;
    }
    setReason("");
    setDialog({ action, records: selected });
  }

  async function execute() {
    if (!dialog) return;
    if (dialog.action === "reject" && !reason.trim()) {
      message.warning("Bắt buộc nhập lý do từ chối");
      return;
    }
    setBusy(true);
    setResults([]);
    setProgress({ completed: 0, total: dialog.records.length });
    try {
      const outcome = await processWorkflowSelection(
        dialog.action,
        dialog.records.map((record) => record.uuid),
        reason,
        (completed, count) => setProgress({ completed, total: count }),
      );
      setResults(outcome);
      setSelectedIds([]);
      const succeeded = outcome.filter((result) => result.success).length;
      const notice =
        actionLabels[dialog.action] +
        ": " +
        succeeded +
        "/" +
        outcome.length +
        " hồ sơ thành công";
      if (succeeded === outcome.length) message.success(notice);
      else message.warning(notice + ". Xem lỗi từng hồ sơ bên dưới.");
      setDialog(null);
      setRevision((value) => value + 1);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không xử lý được hồ sơ",
      );
    } finally {
      setBusy(false);
    }
  }

  const identityColumns: ColumnsType<WorkflowDiploma> = [
    {
      title: "Sinh viên",
      key: "student",
      width: 200,
      render: (_, record) => (
        <>
          <Typography.Text strong>{record.fullName}</Typography.Text>
          <br />
          <Typography.Text type="secondary">{record.mssv}</Typography.Text>
        </>
      ),
    },
    {
      title: "Văn bằng",
      key: "diploma",
      width: 180,
      render: (_, record) => (
        <>
          {record.soHieu}
          <br />
          <Typography.Text type="secondary">
            Sổ: {record.soVaoSo}
          </Typography.Text>
          <br />
          <Typography.Text type="secondary">
            {degreeOptions.find((option) => option.value === record.degreeType)
              ?.label || "Chưa xác nhận loại bằng"}
          </Typography.Text>
        </>
      ),
    },
    {
      title: "Ngày cấp",
      dataIndex: "issueDate",
      width: 120,
      render: (value, record) =>
        value ||
        (record.issueDateStatus === "NOT_IN_SOURCE"
          ? "Sổ gốc không ghi"
          : "Chưa xác nhận"),
    },
  ];
  const columns: ColumnsType<WorkflowDiploma> = [
    ...identityColumns,
    {
      title: "Ngành / Năm TN",
      key: "academic",
      width: 180,
      render: (_, record) => (
        <>
          {record.major}
          <br />
          {record.namTotNghiep} · {record.grade || "Chưa có xếp loại"}
        </>
      ),
    },
    {
      title: "Nguồn hồ sơ",
      key: "source",
      width: 220,
      render: (_, record) => (
        <>
          <Typography.Text type="secondary">
            {record.requestType === "DIGITIZATION"
              ? "Số hóa dữ liệu"
              : "Thêm mới"}
          </Typography.Text>
          <br />
          {record.sourceFileName || record.campusName}
          <br />
          <Typography.Text type="secondary">
            {record.sourceSheet
              ? record.sourceSheet + " · dòng " + record.sourceRowNumber
              : record.campusName}
          </Typography.Text>
        </>
      ),
    },
    {
      title: prepare ? "Điều kiện phát hành" : "Người lập / Thời gian",
      key: "condition",
      width: 210,
      render: (_, record) =>
        prepare ? (
          record.requestErrors?.length ? (
            <Typography.Text type="danger">
              {record.requestErrors[0]}
            </Typography.Text>
          ) : (
            <Typography.Text type="success">Sẵn sàng phát hành</Typography.Text>
          )
        ) : (
          <>
            {record.campusName}
            <br />
            {record.requestedAt
              ? new Date(record.requestedAt).toLocaleString("vi-VN")
              : "—"}
            {record.requestedBy === user?.id && (
              <>
                <br />
                <Typography.Text type="warning">
                  Hồ sơ do bạn lập
                </Typography.Text>
              </>
            )}
          </>
        ),
    },
    {
      title: "Thao tác",
      key: "actions",
      fixed: "right",
      width: canAct ? 175 : 64,
      render: (_, record) => (
        <Space wrap>
          <Tooltip title="Xem chi tiết hồ sơ">
            <Button
              size="small"
              aria-label="Xem chi tiết hồ sơ"
              icon={<EyeOutlined />}
              onClick={() => setDetail(record)}
            />
          </Tooltip>
          {prepare && !!record.requestErrors?.length ? (
            <Button
              size="small"
              icon={<FileSearchOutlined />}
              disabled={disabled}
              href={registryReviewHref(record)}
            >
              Kiểm tra dữ liệu
            </Button>
          ) : canAct ? (
            <Button
              size="small"
              type="primary"
              disabled={
                disabled || !canSelectWorkflowDiploma(record, mode, user?.id)
              }
              onClick={() => openAction("approve", [record.uuid])}
            >
              Duyệt và phát hành
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];
  const failed = results.filter((result) => !result.success).length;
  const batchSummary = batches.find(
    (batch) => batch.value === batchId,
  )?.reviewSummary;
  const reviewHref =
    "/import" +
    (batchId
      ? "?batchId=" + encodeURIComponent(batchId) + "&status=NEEDS_REVIEW"
      : "");

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Typography.Title level={3}>
            {prepare
              ? "Duyệt và phát hành văn bằng"
              : canApprove
                ? "Hồ sơ chờ xử lý nội bộ"
                : "Theo dõi hồ sơ nội bộ"}
          </Typography.Title>
        </div>
        <Space wrap>
          {prepare && (
            <Button type="link" href={reviewHref}>
              Kiểm tra dữ liệu
            </Button>
          )}
          <Button type="link" href={prepare ? "/pending" : "/certificates"}>
            {prepare ? "Hồ sơ chờ xử lý" : "Văn bằng đã cấp"}
          </Button>
        </Space>
      </div>
      {prepare && !loading && !total && (
        <Alert
          showIcon
          type="warning"
          title={
            search
              ? "Không tìm thấy hồ sơ khớp từ khóa"
              : "Chưa có văn bằng nháp để duyệt phát hành"
          }
          description={
            <div className="space-y-2">
              {batchSummary && <p>{registryBatchSummaryText(batchSummary)}</p>}
              <p>
                {search
                  ? "Hãy xóa từ khóa hoặc chọn đợt rà soát khác."
                  : "Chưa có hồ sơ nháp đã kiểm tra. Hồ sơ thiếu ngày cấp cần được xác nhận trước khi duyệt phát hành. Hồ sơ cấp mới nằm trong danh sách chờ xử lý nội bộ."}
              </p>
              <Button href={reviewHref}>
                Quay lại rà soát, bổ sung thông tin
              </Button>
            </div>
          }
        />
      )}
      <section className="border-t border-gray-200 pt-4">
        <Space wrap className="mb-4">
          <Input.Search
            allowClear
            placeholder="Tìm MSSV, họ tên, số hiệu, số vào sổ"
            style={{ width: 300, maxWidth: "100%" }}
            disabled={disabled}
            onSearch={(value) => {
              setSearch(value.trim());
              setPage(1);
              setSelectedIds([]);
            }}
          />
          {prepare && (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Tất cả đợt đã rà soát"
              style={{ width: 300, maxWidth: "100%" }}
              value={batchId || undefined}
              options={batches}
              disabled={disabled}
              onChange={(value) => {
                setBatchId(value || "");
                setPage(1);
                setSelectedIds([]);
              }}
            />
          )}
          <Button
            icon={<ReloadOutlined />}
            aria-label="Làm mới danh sách"
            title="Làm mới danh sách"
            loading={loading}
            disabled={disabled}
            onClick={() => {
              setSelectedIds([]);
              setRevision((value) => value + 1);
            }}
          />
          {prepare && (
            <Button
              type="primary"
              disabled={disabled}
              onClick={() => setNewRequestOpen(true)}
            >
              Thêm hồ sơ cấp mới
            </Button>
          )}
        </Space>
        {canAct && selectedIds.length > 0 && (
          <div className="mb-4 border-y border-gray-200 py-3">
            <Space wrap>
              <Typography.Text strong>
                Đã chọn {selectedIds.length} hồ sơ
              </Typography.Text>
              <Button
                disabled={disabled || !selectedIds.length}
                onClick={() => setSelectedIds([])}
              >
                Bỏ chọn
              </Button>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                disabled={disabled || !selectedIds.length}
                onClick={() => openAction("approve", selectedIds)}
              >
                Duyệt và phát hành
              </Button>
              {canApprove && !prepare && (
                <Button
                  danger
                  disabled={disabled || !selectedIds.length}
                  onClick={() => openAction("reject", selectedIds)}
                >
                  Từ chối
                </Button>
              )}
            </Space>
          </div>
        )}
        {busy && (
          <Progress
            percent={
              progress.total
                ? Math.round((progress.completed * 100) / progress.total)
                : 0
            }
            format={() => progress.completed + "/" + progress.total}
          />
        )}
        <Table<WorkflowDiploma>
          rowKey="uuid"
          dataSource={data}
          columns={columns}
          loading={loading || selecting}
          scroll={{ x: 1400 }}
          rowSelection={
            canAct
              ? {
                  selectedRowKeys: selectedIds,
                  preserveSelectedRowKeys: true,
                  selections: [
                    {
                      key: "all-results",
                      text: "Chọn toàn bộ kết quả",
                      onSelect: selectAll,
                    },
                  ],
                  onChange: (keys) => setSelectedIds(keys.map(String)),
                  getCheckboxProps: (record) => ({
                    disabled:
                      disabled ||
                      !canSelectWorkflowDiploma(record, mode, user?.id),
                  }),
                }
              : undefined
          }
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showTotal: (count) => "Tổng " + count + " hồ sơ",
            onChange: (nextPage, nextSize) => {
              setPage(nextSize !== pageSize ? 1 : nextPage);
              setPageSize(nextSize);
            },
          }}
          locale={{
            emptyText: prepare
              ? "Chưa có hồ sơ chờ phát hành. Hãy vào Kiểm tra dữ liệu để lưu hồ sơ hợp lệ."
              : "Không có yêu cầu nào đang chờ duyệt",
          }}
        />
      </section>
      {!!results.length && (
        <section className="border-t border-gray-200 pt-4">
          <Typography.Title level={4}>Kết quả lượt xử lý</Typography.Title>
          <Alert
            className="mb-4"
            showIcon
            type={failed ? "warning" : "success"}
            title={
              results.length -
              failed +
              " thành công · " +
              failed +
              " chưa thành công"
            }
            description="Kết quả được lưu riêng cho từng hồ sơ. Hồ sơ lỗi không làm mất kết quả các hồ sơ đã xử lý thành công."
          />
          <Table<WorkflowResult>
            rowKey="uuid"
            dataSource={results}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 800 }}
            columns={[
              {
                title: "Sinh viên",
                render: (_, result) =>
                  records.current.get(result.uuid)?.fullName || result.uuid,
              },
              {
                title: "Số hiệu",
                render: (_, result) =>
                  records.current.get(result.uuid)?.soHieu || "—",
              },
              {
                title: "Kết quả",
                render: (_, result) =>
                  result.success ? (
                    <Tag color="green">
                      {resultLabels[result.status || ""] || "Thành công"}
                    </Tag>
                  ) : (
                    <Typography.Text type="danger">
                      {result.error}
                    </Typography.Text>
                  ),
              },
            ]}
          />
        </section>
      )}
      <Modal
        width={900}
        open={!!dialog}
        title={
          dialog
            ? actionLabels[dialog.action] +
              " " +
              dialog.records.length +
              " hồ sơ"
            : ""
        }
        okText={
          dialog
            ? "Xác nhận " + actionLabels[dialog.action].toLowerCase()
            : "Xác nhận"
        }
        cancelText="Hủy"
        confirmLoading={busy}
        closable={!busy}
        maskClosable={!busy}
        cancelButtonProps={{ disabled: busy }}
        onCancel={() => {
          if (!busy) setDialog(null);
        }}
        onOk={execute}
        okButtonProps={{ danger: dialog?.action === "reject" }}
      >
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          title={
            dialog?.action === "submit"
              ? "Xác nhận duyệt phát hành đúng các hồ sơ được chọn"
              : dialog?.action === "approve"
                ? "Xác nhận đã đối chiếu các hồ sơ được chọn với nguồn gốc"
                : "Các hồ sơ bên dưới sẽ bị từ chối với lý do chung"
          }
          description={
            dialog?.action === "approve"
              ? "Hệ thống kiểm tra quyền và trạng thái từng hồ sơ trước khi duyệt. Cán bộ cơ sở chính trực tiếp duyệt và ký số; không cần người duyệt thứ hai."
              : "Thông tin đã rà soát được giữ nguyên. Thao tác hàng loạt vẫn có lịch sử và kết quả riêng cho từng văn bằng."
          }
        />
        <Table<WorkflowDiploma>
          rowKey="uuid"
          size="small"
          dataSource={dialog?.records || []}
          columns={identityColumns}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 650 }}
        />
        {dialog?.action === "reject" && (
          <Input.TextArea
            className="mt-4"
            rows={3}
            maxLength={2000}
            showCount
            value={reason}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Lý do từ chối bắt buộc, áp dụng cho các hồ sơ đã chọn"
          />
        )}
        {busy && (
          <Progress
            percent={
              progress.total
                ? Math.round((progress.completed * 100) / progress.total)
                : 0
            }
          />
        )}
      </Modal>
      <Modal
        title="Chi tiết hồ sơ"
        width={760}
        open={!!detail}
        footer={
          detail ? (
            <Space wrap>
              {prepare && !!detail.requestErrors?.length && (
                <Button
                  icon={<FileSearchOutlined />}
                  disabled={disabled}
                  href={registryReviewHref(detail)}
                >
                  Kiểm tra dữ liệu
                </Button>
              )}
              {prepare && (
                <Button
                  icon={<FilePdfOutlined />}
                  href={"/api/cert/" + detail.uuid + "/preview"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Xem trước PDF
                </Button>
              )}
              {canApprove && !prepare && (
                <Button
                  danger
                  disabled={
                    disabled ||
                    !canSelectWorkflowDiploma(detail, mode, user?.id)
                  }
                  onClick={() => {
                    openAction("reject", [detail.uuid]);
                    setDetail(null);
                  }}
                >
                  Từ chối
                </Button>
              )}
              {canAct && (
                <Button
                  type="primary"
                  disabled={
                    disabled ||
                    !canSelectWorkflowDiploma(detail, mode, user?.id)
                  }
                  onClick={() => {
                    openAction("approve", [detail.uuid]);
                    setDetail(null);
                  }}
                >
                  Duyệt và phát hành
                </Button>
              )}
            </Space>
          ) : null
        }
        onCancel={() => setDetail(null)}
      >
        {detail && (
          <>
            <Descriptions
              bordered
              column={1}
              size="small"
              items={[
                {
                  key: "signatures",
                  label: "Chữ ký PDF",
                  children: (detail.pdfSignatureCount || 0) + " chữ ký số",
                },
                { key: "mssv", label: "MSSV", children: detail.mssv },
                { key: "name", label: "Họ tên", children: detail.fullName },
                { key: "dob", label: "Ngày sinh", children: detail.dob || "—" },
                {
                  key: "major",
                  label: "Ngành / Lớp",
                  children: detail.major + " / " + (detail.className || "—"),
                },
                {
                  key: "year",
                  label: "Năm tốt nghiệp / Xếp loại",
                  children: detail.namTotNghiep + " / " + (detail.grade || "—"),
                },
                {
                  key: "gpa",
                  label: "GPA",
                  children: detail.gpa ?? "Nguồn không có",
                },
                {
                  key: "number",
                  label: "Số hiệu / Số vào sổ",
                  children: detail.soHieu + " / " + detail.soVaoSo,
                },
                {
                  key: "degree",
                  label: "Loại bằng",
                  children:
                    degreeOptions.find(
                      (option) => option.value === detail.degreeType,
                    )?.label || "Chưa xác nhận",
                },
                {
                  key: "latin",
                  label: "Họ tên trang tiếng Anh",
                  children: detail.printedDiploma?.fullNameLatin || "Chưa có",
                },
                {
                  key: "major-en",
                  label: "Ngành tiếng Anh",
                  children:
                    detail.printedDiploma?.majorNameEn || "Chưa xác nhận",
                },
                {
                  key: "place",
                  label: "Nơi cấp trên bằng",
                  children:
                    detail.printedDiploma?.issuePlace || "Chưa xác nhận",
                },
                {
                  key: "signer",
                  label: "Người ký trên bằng",
                  children:
                    [
                      detail.printedDiploma?.diplomaSignerTitle,
                      detail.printedDiploma?.diplomaSignerName,
                    ]
                      .filter(Boolean)
                      .join(" - ") ||
                    "Chưa xác nhận; không dùng tên người ký quyết định thay thế",
                },
                {
                  key: "date",
                  label: "Ngày cấp",
                  children:
                    detail.issueDate ||
                    (detail.issueDateStatus === "NOT_IN_SOURCE"
                      ? "Sổ gốc không ghi"
                      : "Chưa xác nhận"),
                },
                {
                  key: "decision",
                  label: "Quyết định / Ngày ký",
                  children:
                    (detail.decisionNo || "—") +
                    " / " +
                    (detail.decisionDate || "—"),
                },
                {
                  key: "campus",
                  label: "Cơ sở nguồn",
                  children: detail.campusName,
                },
                {
                  key: "source",
                  label: "File nguồn",
                  children: detail.sourceFileName || "Hồ sơ lập riêng",
                },
                {
                  key: "row",
                  label: "Vị trí nguồn",
                  children: detail.sourceSheet
                    ? detail.sourceSheet + " · dòng " + detail.sourceRowNumber
                    : "—",
                },
              ]}
            />
            {!!detail.requestErrors?.length && (
              <Alert
                className="mt-4"
                type="error"
                title="Chưa đủ điều kiện phát hành"
                description={detail.requestErrors.join("; ")}
              />
            )}
            {!!detail.printWarnings?.length &&
              !detail.requestErrors?.length && (
                <Alert
                  className="mt-4"
                  type="warning"
                  showIcon
                  title="Thông tin in bằng còn thiếu"
                  description={
                    detail.printWarnings.join("; ") +
                    ". Thông tin chưa xác nhận không được tự điền."
                  }
                />
              )}
          </>
        )}
      </Modal>
      <NewDiplomaRequest
        open={newRequestOpen}
        onClose={() => setNewRequestOpen(false)}
        onSaved={() => {
          setNewRequestOpen(false);
          setRevision((value) => value + 1);
        }}
      />
    </div>
  );
}
