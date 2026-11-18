"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import PageTitle from "@/components/PageTitle";
import DiplomaPrintDataEditor from "@/components/DiplomaPrintDataEditor";
import { workflowJson, type WorkflowResult } from "@/lib/diploma-workflow";
import {
  batchPublishEntries,
  issuanceRowHref,
  issuanceStateColors,
  issuanceStateLabels,
  type IssuanceBatch,
  type IssuanceBatchDetail,
  type IssuanceBatchRow,
} from "@/lib/issuance-batches";

const endpoint = "/api/cert/issuance-batches";
function detailHref(id: string) {
  return "/issue?" + new URLSearchParams({ issuanceBatchId: id });
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Không xử lý được yêu cầu";
}
function displayDate(date: string | null) {
  return date
    ? new Date(date + "T00:00:00Z").toLocaleDateString("vi-VN", {
        timeZone: "UTC",
      })
    : "Chưa ghi nhận";
}

const identityColumns: ColumnsType<IssuanceBatchRow> = [
  {
    title: "Sinh viên",
    key: "student",
    width: 210,
    render: (_, row) => (
      <>
        <Typography.Text strong>{row.fullName}</Typography.Text>
        <br />
        <Typography.Text type="secondary">{row.mssv}</Typography.Text>
      </>
    ),
  },
  {
    title: "Văn bằng",
    key: "diploma",
    width: 180,
    render: (_, row) => (
      <>
        {row.soHieu}
        <br />
        <Typography.Text type="secondary">Sổ: {row.soVaoSo}</Typography.Text>
      </>
    ),
  },
  { title: "Ngành", dataIndex: "major", width: 190 },
  {
    title: "Kết quả kiểm tra",
    key: "check",
    width: 310,
    render: (_, row) =>
      row.checkErrors.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, color: "#a63a20" }}>
          {row.checkErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : row.ready ? (
        <Tag color="green">Đủ điều kiện duyệt</Tag>
      ) : (
        <Typography.Text type="secondary">
          {issuanceStateLabels[row.batchState]}
        </Typography.Text>
      ),
  },
];

function CreateBatchModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setBusy(true);
    setError("");
    try {
      const result = await workflowJson<{ data: IssuanceBatch }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      message.success(
        "Đã lập đợt cấp văn bằng. Anh chọn hồ sơ cần đưa vào đợt.",
      );
      onCreated(result.data.id);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title="Lập đợt cấp văn bằng"
      onCancel={() => {
        if (!busy) onClose();
      }}
      onOk={save}
      okText="Tạo đợt"
      cancelText="Hủy"
      confirmLoading={busy}
      cancelButtonProps={{ disabled: busy }}
      maskClosable={!busy}
      width={700}
    >
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          className="mb-4"
          style={{ marginBottom: 16 }}
        />
      )}
      <Alert
        type="info"
        showIcon
        title="Đợt được xác định theo năm phát hành"
        description="Năm phát hành có thể khác năm tốt nghiệp và phải khớp năm trên ngày cấp văn bằng. Một đợt có thể gồm nhiều quyết định và ngành đào tạo."
        style={{ marginBottom: 16 }}
      />
      <Form
        form={form}
        layout="vertical"
        disabled={busy}
        initialValues={{
          issuanceYear: new Date().getFullYear(),
          batchNumber: 1,
        }}
      >
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="issuanceYear"
              label="Năm phát hành"
              rules={[{ required: true, message: "Nhập năm phát hành" }]}
            >
              <InputNumber
                min={1900}
                max={2200}
                precision={0}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="batchNumber"
              label="Số đợt"
              rules={[{ required: true, message: "Nhập số đợt" }]}
            >
              <InputNumber
                min={1}
                max={999}
                precision={0}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

function CandidateModal({
  batch,
  onClose,
  onAdded,
}: {
  batch: IssuanceBatch;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [rows, setRows] = useState<IssuanceBatchRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setSelected([]);
    setError("");
    workflowJson<{ data: IssuanceBatchRow[]; pagination: { total: number } }>(
      endpoint +
        "/" +
        encodeURIComponent(batch.id) +
        "/candidates?" +
        new URLSearchParams({ page: String(page), limit: "20", search }),
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setRows(result.data);
          setTotal(result.pagination.total);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setRows([]);
          setError(errorText(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [batch.id, page, search]);
  async function add() {
    setBusy(true);
    setError("");
    try {
      await workflowJson(
        endpoint + "/" + encodeURIComponent(batch.id) + "/members",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ diplomaIds: selected }),
        },
      );
      message.success("Đã thêm " + selected.length + " hồ sơ vào đợt");
      onAdded();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={"Thêm hồ sơ · " + batch.code}
      width={1100}
      onCancel={() => {
        if (!busy) onClose();
      }}
      onOk={add}
      okText={"Thêm " + selected.length + " hồ sơ"}
      cancelText="Đóng"
      okButtonProps={{ disabled: !selected.length || loading }}
      confirmLoading={busy}
      cancelButtonProps={{ disabled: busy }}
      maskClosable={!busy}
    >
      <Alert
        type="info"
        showIcon
        className="mb-4"
        style={{ marginBottom: 16 }}
        title="Chỉ hiển thị bản nháp chưa ký, chưa thuộc đợt khác"
        description={
          batch.issuanceYear === null
            ? "Đợt cũ chỉ nhận hồ sơ phù hợp quyết định, năm tốt nghiệp và ngành đã chọn."
            : "Chọn các hồ sơ của nhà trường để đưa vào đợt. Hồ sơ thiếu dữ liệu cần được bổ sung trước khi phát hành."
        }
      />
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          className="mb-4"
          style={{ marginBottom: 16 }}
        />
      )}
      <Input.Search
        aria-label="Tìm hồ sơ để thêm vào đợt"
        placeholder="Họ tên, MSSV, số hiệu hoặc số vào sổ"
        allowClear
        onSearch={(value) => {
          setPage(1);
          setSearch(value.trim());
        }}
        disabled={busy}
        className="mb-4"
        style={{ marginBottom: 16 }}
      />
      <Table<IssuanceBatchRow>
        rowKey="uuid"
        columns={identityColumns}
        dataSource={rows}
        loading={loading || busy}
        scroll={{ x: 900 }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys.map(String)),
          getCheckboxProps: () => ({ disabled: busy || loading }),
        }}
        pagination={{
          current: page,
          pageSize: 20,
          total,
          showSizeChanger: false,
          onChange: setPage,
          showTotal: (count) => count + " hồ sơ phù hợp",
        }}
        locale={{
          emptyText: "Không có bản nháp phù hợp chưa được đưa vào đợt",
        }}
      />
    </Modal>
  );
}

function BatchDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<IssuanceBatchDetail | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<IssuanceBatchRow[]>([]);
  const [confirmation, setConfirmation] = useState<IssuanceBatchRow[] | null>(
    null,
  );
  const [results, setResults] = useState<
    (WorkflowResult & { fullName?: string; mssv?: string })[] | null
  >(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setSelected([]);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
      search,
    });
    if (status) params.set("status", status);
    workflowJson<IssuanceBatchDetail>(
      endpoint + "/" + encodeURIComponent(id) + "?" + params,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setDetail(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setDetail(null);
          setError(errorText(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, page, search, status, revision]);
  function refresh() {
    setSelected([]);
    setRevision((value) => value + 1);
  }
  const [operationError, setOperationError] = useState("");
  async function publish() {
    if (!confirmation) return;
    setBusy(true);
    setError("");
    setOperationError("");
    try {
      const response = await workflowJson<{ results: WorkflowResult[] }>(
        endpoint + "/" + encodeURIComponent(id) + "/publish",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: batchPublishEntries(confirmation) }),
        },
      );
      setResults(
        response.results.map((result) => ({
          ...result,
          fullName: confirmation.find((row) => row.uuid === result.uuid)
            ?.fullName,
          mssv: confirmation.find((row) => row.uuid === result.uuid)?.mssv,
        })),
      );
    } catch (cause) {
      setOperationError(
        errorText(cause) +
          ". Không tự gửi lại; hãy kiểm tra trạng thái vì một số hồ sơ có thể đã được xử lý.",
      );
    } finally {
      setBusy(false);
      setConfirmation(null);
      refresh();
    }
  }
  function remove(row: IssuanceBatchRow) {
    Modal.confirm({
      title: "Gỡ hồ sơ khỏi đợt?",
      content:
        row.fullName +
        " · " +
        row.mssv +
        ". Chỉ gỡ liên kết với đợt, không xóa hồ sơ hoặc dữ liệu nguồn.",
      okText: "Gỡ khỏi đợt",
      cancelText: "Giữ lại",
      onOk: async () => {
        setBusy(true);
        try {
          await workflowJson(
            endpoint + "/" + encodeURIComponent(id) + "/members/remove",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ diplomaIds: [row.uuid] }),
            },
          );
          message.success("Đã gỡ hồ sơ khỏi đợt");
          refresh();
        } catch (cause) {
          message.error(errorText(cause));
          throw cause;
        } finally {
          setBusy(false);
        }
      },
    });
  }
  const columns: ColumnsType<IssuanceBatchRow> = [
    ...identityColumns.slice(0, 3),
    {
      title: "Trạng thái",
      key: "state",
      width: 155,
      render: (_, row) => (
        <Tag color={issuanceStateColors[row.batchState]}>
          {issuanceStateLabels[row.batchState]}
        </Tag>
      ),
    },
    identityColumns[3],
    {
      title: "Thao tác",
      key: "actions",
      width: 185,
      render: (_, row) => (
        <Space orientation="vertical" size={4}>
          <Link href={issuanceRowHref(row)}>Mở hồ sơ liên quan</Link>
          {row.removable && (
            <Button
              size="small"
              disabled={busy || loading}
              onClick={() => setEditing([row])}
            >
              Bổ sung thông tin in
            </Button>
          )}
          {["DRAFT", "PENDING"].includes(row.batchState) && (
            <a
              href={"/api/cert/" + encodeURIComponent(row.uuid) + "/preview"}
              target="_blank"
              rel="noreferrer"
            >
              Xem trước PDF
            </a>
          )}
          {row.removable && (
            <Button
              size="small"
              danger
              type="link"
              disabled={busy || loading}
              onClick={() => remove(row)}
            >
              Gỡ khỏi đợt
            </Button>
          )}
        </Space>
      ),
    },
  ];
  const summary = detail?.summary;
  return (
    <>
      <Space wrap className="mb-4" style={{ marginBottom: 16 }}>
        <Link href="/issue">
          <Button
            icon={<ArrowLeftOutlined aria-hidden="true" />}
            disabled={busy}
          >
            Danh sách đợt
          </Button>
        </Link>
        <Button
          icon={<ReloadOutlined aria-hidden="true" />}
          onClick={refresh}
          loading={loading}
          disabled={busy}
        >
          Kiểm tra lại đợt
        </Button>
        <Button
          icon={<PlusOutlined aria-hidden="true" />}
          onClick={() => setAdding(true)}
          disabled={!detail || busy || loading}
        >
          Thêm hồ sơ
        </Button>
      </Space>
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          className="mb-4"
          style={{ marginBottom: 16 }}
        />
      )}
      {operationError && (
        <Alert
          type="error"
          showIcon
          title={operationError}
          className="mb-4"
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setOperationError("")}
        />
      )}
      {detail && (
        <>
          <Card className="mb-4" style={{ marginBottom: 16 }}>
            <Descriptions
              title={detail.batch.name}
              column={{ xs: 1, sm: 2, lg: 3 }}
              items={[
                { key: "code", label: "Mã đợt", children: detail.batch.code },
                {
                  key: "issuanceYear",
                  label: "Năm phát hành",
                  children:
                    detail.batch.issuanceYear ?? "Đợt cũ - chưa ghi nhận",
                },
                {
                  key: "decision",
                  label: "Quyết định",
                  children: detail.batch.decisionNo ?? "Theo từng hồ sơ",
                },
                {
                  key: "date",
                  label: "Ngày ký quyết định",
                  children:
                    detail.batch.issuanceYear === null
                      ? displayDate(detail.batch.decisionDate)
                      : "Theo từng hồ sơ",
                },
                {
                  key: "year",
                  label: "Năm tốt nghiệp",
                  children: detail.batch.graduationYear ?? "Theo từng hồ sơ",
                },
                {
                  key: "program",
                  label: "Ngành",
                  children:
                    detail.batch.programName ||
                    (detail.batch.issuanceYear === null
                      ? "Tất cả ngành của quyết định"
                      : "Theo từng hồ sơ"),
                },
                {
                  key: "creator",
                  label: "Người lập",
                  children: detail.batch.createdBy,
                },
              ]}
            />
          </Card>
          <Row gutter={[12, 12]} className="mb-4" style={{ marginBottom: 16 }}>
            {[
              ["Tổng hồ sơ", summary?.total],
              ["Sẵn sàng duyệt", summary?.ready],
              ["Cần bổ sung", summary?.needsReview],
              ["Bị từ chối", summary?.REJECTED],
              ["Chờ blockchain", summary?.ANCHOR_PENDING],
              ["Lỗi blockchain", summary?.ANCHOR_FAILED],
              ["Đã phát hành", summary?.ON_CHAIN],
              [
                "Thu hồi / Thay thế",
                (summary?.REVOKED || 0) + (summary?.REPLACED || 0),
              ],
            ].map(([label, count]) => (
              <Col xs={12} md={6} key={String(label)}>
                <Card size="small">
                  <Statistic title={label} value={Number(count || 0)} />
                </Card>
              </Col>
            ))}
          </Row>
          <Alert
            className="mb-4"
            style={{ marginBottom: 16 }}
            type="info"
            showIcon
            title="Chỉ ghi nhận đã phát hành khi blockchain xác nhận"
            description={
              "Kết quả kiểm tra toàn đợt: " +
              new Date(detail.checkedAt).toLocaleString("vi-VN") +
              ". Sẵn sàng duyệt và Cần bổ sung là các nhóm trong hồ sơ chưa duyệt, không cộng thêm vào tổng. Chọn hồ sơ cụ thể và xác nhận trước khi ký."
            }
          />
          <Row gutter={[12, 12]} className="mb-4" style={{ marginBottom: 16 }}>
            <Col xs={24} lg={10}>
              <Input.Search
                aria-label="Tìm trong đợt cấp văn bằng"
                placeholder="Họ tên, MSSV, số hiệu, số vào sổ"
                allowClear
                disabled={busy}
                onSearch={(value) => {
                  setPage(1);
                  setSearch(value.trim());
                  setSelected([]);
                }}
              />
            </Col>
            <Col xs={24} sm={12} lg={7}>
              <Select
                aria-label="Lọc trạng thái hồ sơ trong đợt"
                style={{ width: "100%" }}
                allowClear
                placeholder="Tất cả trạng thái"
                value={status}
                disabled={busy}
                onChange={(value) => {
                  setStatus(value);
                  setPage(1);
                  setSelected([]);
                }}
                options={[
                  { value: "READY", label: "Sẵn sàng duyệt" },
                  { value: "NEEDS_REVIEW", label: "Cần bổ sung" },
                  ...Object.entries(issuanceStateLabels).map(
                    ([value, label]) => ({ value, label }),
                  ),
                ]}
              />
            </Col>
            <Col xs={24} sm={12} lg={7}>
              <Button
                type="primary"
                block
                icon={<CheckCircleOutlined aria-hidden="true" />}
                disabled={!selected.length || loading || busy}
                onClick={() =>
                  setConfirmation(
                    detail.data.filter((row) => selected.includes(row.uuid)),
                  )
                }
              >
                Duyệt và ký {selected.length || ""} hồ sơ
              </Button>
            </Col>
          </Row>
          <Table<IssuanceBatchRow>
            rowKey="uuid"
            columns={columns}
            dataSource={detail.data}
            loading={loading || busy}
            scroll={{ x: 1350 }}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: (keys) => setSelected(keys.map(String)),
              getCheckboxProps: (row) => ({
                disabled: !row.ready || loading || busy,
              }),
            }}
            pagination={{
              current: page,
              pageSize: 20,
              total: detail.pagination.total,
              showSizeChanger: false,
              onChange: (value) => {
                setPage(value);
                setSelected([]);
              },
              showTotal: (count) => count + " hồ sơ theo bộ lọc",
            }}
            locale={{
              emptyText: summary?.total
                ? "Không có hồ sơ phù hợp bộ lọc"
                : "Đợt chưa có hồ sơ. Nhấn Thêm hồ sơ để bắt đầu.",
            }}
          />
        </>
      )}
      {adding && detail && (
        <CandidateModal
          batch={detail.batch}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
      {editing.length > 0 && (
        <DiplomaPrintDataEditor
          records={editing}
          onClose={() => setEditing([])}
          onSaved={() => {
            setEditing([]);
            refresh();
          }}
        />
      )}
      <Modal
        open={!!confirmation}
        title="Xác nhận duyệt và ký phát hành"
        onCancel={() => {
          if (!busy) setConfirmation(null);
        }}
        onOk={publish}
        okText="Xác nhận duyệt và ký"
        cancelText="Quay lại"
        confirmLoading={busy}
        cancelButtonProps={{ disabled: busy }}
        maskClosable={!busy}
        width={760}
      >
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          style={{ marginBottom: 16 }}
          title={
            "Anh đang duyệt " + (confirmation?.length || 0) + " hồ sơ đã chọn"
          }
          description="Hệ thống kiểm tra lại từng hồ sơ, ký PDF và xếp giao dịch blockchain. Một hồ sơ lỗi không làm mất kết quả hồ sơ khác. Thao tác không đồng nghĩa blockchain đã xác nhận phát hành."
        />
        <Table
          rowKey="uuid"
          size="small"
          dataSource={confirmation || []}
          columns={identityColumns.slice(0, 2)}
          pagination={false}
          scroll={{ y: 320 }}
        />
      </Modal>
      <Modal
        open={!!results}
        title="Kết quả xử lý từng hồ sơ"
        onCancel={() => setResults(null)}
        footer={
          <Button
            type="primary"
            onClick={() => {
              setResults(null);
              refresh();
            }}
          >
            Đóng và kiểm tra lại trạng thái
          </Button>
        }
        width={900}
      >
        <Alert
          type={results?.some((row) => !row.success) ? "warning" : "success"}
          showIcon
          className="mb-4"
          style={{ marginBottom: 16 }}
          title={
            (results?.filter((row) => row.success).length || 0) +
            "/" +
            (results?.length || 0) +
            " hồ sơ đã duyệt, chờ blockchain"
          }
        />
        <Table
          rowKey="uuid"
          size="small"
          dataSource={results || []}
          pagination={false}
          scroll={{ x: 650, y: 400 }}
          columns={[
            { title: "Sinh viên", dataIndex: "fullName", width: 200 },
            { title: "MSSV", dataIndex: "mssv", width: 140 },
            {
              title: "Kết quả",
              key: "result",
              render: (_, row) =>
                row.success ? (
                  <Tag color="gold">Đã duyệt, chờ blockchain</Tag>
                ) : (
                  <Typography.Text type="danger">{row.error}</Typography.Text>
                ),
            },
          ]}
        />
      </Modal>
    </>
  );
}

export default function IssuanceBatchesClient({
  initialBatchId = "",
}: {
  initialBatchId?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<IssuanceBatch[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [issuanceYear, setIssuanceYear] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (initialBatchId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    workflowJson<{ data: IssuanceBatch[]; pagination: { total: number } }>(
      endpoint +
        "?" +
        new URLSearchParams({
          page: String(page),
          limit: "20",
          search,
          ...(issuanceYear ? { issuanceYear: String(issuanceYear) } : {}),
        }),
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setRows(result.data);
          setTotal(result.pagination.total);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setRows([]);
          setError(errorText(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialBatchId, page, search, revision, issuanceYear]);
  const columns: ColumnsType<IssuanceBatch> = [
    {
      title: "Đợt cấp văn bằng",
      key: "batch",
      width: 250,
      render: (_, row) => (
        <>
          <Link href={detailHref(row.id)}>
            <Typography.Text strong>{row.name}</Typography.Text>
          </Link>
          <br />
          <Typography.Text type="secondary">
            {row.issuanceYear === null
              ? "Đợt cũ - chưa ghi nhận năm phát hành"
              : `Năm phát hành ${row.issuanceYear} · Đợt ${row.batchNumber}`}
          </Typography.Text>
        </>
      ),
    },
    {
      title: "Quyết định tốt nghiệp",
      key: "decision",
      width: 220,
      render: (_, row) => (
        <>
          {row.decisionNo ?? "Theo từng hồ sơ"}
          <br />
          <Typography.Text type="secondary">
            {row.decisionDate ? "Ngày " + displayDate(row.decisionDate) : ""}
          </Typography.Text>
        </>
      ),
    },
    {
      title: "Năm / Ngành",
      key: "scope",
      width: 220,
      render: (_, row) => (
        <>
          {row.graduationYear ?? "Theo từng hồ sơ"}
          <br />
          {row.programName ||
            (row.issuanceYear === null
              ? "Tất cả ngành của quyết định"
              : "Theo từng hồ sơ")}
        </>
      ),
    },
    {
      title: "Tiến độ",
      key: "progress",
      width: 240,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>
            {row.summary.total} hồ sơ · {row.summary.ON_CHAIN} đã phát hành
          </span>
          <span>
            {row.summary.DRAFT + row.summary.PENDING} chưa duyệt ·{" "}
            {row.summary.REJECTED} bị từ chối
          </span>
          <span>
            {row.summary.ANCHOR_PENDING} chờ blockchain ·{" "}
            {row.summary.ANCHOR_FAILED} lỗi
          </span>
        </Space>
      ),
    },
    {
      title: "Thao tác",
      key: "action",
      width: 140,
      render: (_, row) => (
        <Link href={detailHref(row.id)}>
          <Button type="primary">Mở đợt</Button>
        </Link>
      ),
    },
  ];
  return (
    <div className="workspace-page">
      <PageTitle>Phát hành văn bằng theo đợt</PageTitle>
      <p className="text-gray-500 mb-6">
        Tạo hoặc chọn đợt theo năm phát hành, kiểm tra hồ sơ và theo dõi tiến độ
        phát hành tại cơ sở chính.
      </p>
      {initialBatchId ? (
        <BatchDetail id={initialBatchId} />
      ) : (
        <>
          <Space wrap className="mb-4" style={{ marginBottom: 16 }}>
            <Button
              type="primary"
              icon={<PlusOutlined aria-hidden="true" />}
              onClick={() => setCreating(true)}
            >
              Lập đợt cấp văn bằng
            </Button>
            <Button
              icon={<ReloadOutlined aria-hidden="true" />}
              loading={loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              Tải lại
            </Button>
            <Link href="/diploma-records">
              <Button icon={<ArrowLeftOutlined aria-hidden="true" />}>
                Hồ sơ cấp văn bằng
              </Button>
            </Link>
          </Space>
          <InputNumber
            aria-label="Lọc năm phát hành"
            placeholder="Lọc năm phát hành"
            min={1900}
            max={2200}
            precision={0}
            value={issuanceYear}
            onChange={(value) => {
              setPage(1);
              setIssuanceYear(value);
            }}
            style={{ marginBottom: 16, width: 220 }}
          />
          <Input.Search
            aria-label="Tìm đợt cấp văn bằng"
            placeholder="Mã đợt, tên đợt hoặc số quyết định"
            allowClear
            onSearch={(value) => {
              setPage(1);
              setSearch(value.trim());
            }}
            className="mb-4"
            style={{ marginBottom: 16 }}
          />
          {error && (
            <Alert
              type="error"
              showIcon
              title={error}
              className="mb-4"
              style={{ marginBottom: 16 }}
            />
          )}
          <Table<IssuanceBatch>
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={loading}
            scroll={{ x: 1050 }}
            pagination={{
              current: page,
              pageSize: 20,
              total,
              showSizeChanger: false,
              onChange: setPage,
              showTotal: (count) => count + " đợt",
            }}
            locale={{
              emptyText:
                "Chưa có đợt phù hợp. Anh có thể tạo đợt theo năm phát hành.",
            }}
          />
        </>
      )}
      {creating && (
        <CreateBatchModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.push(detailHref(id));
          }}
        />
      )}
    </div>
  );
}
