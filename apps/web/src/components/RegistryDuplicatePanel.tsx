"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Pagination, Select, Space, Spin, Tag } from "antd";
import Link from "next/link";
import {
  registryComparisonFields,
  registryComparisonValue,
  registryDuplicateStatus,
  type RegistryDuplicateReport,
} from "@/lib/registry-duplicates";
import styles from "./RegistryDuplicatePanel.module.css";

export default function RegistryDuplicatePanel({
  batchId,
  rowId,
  revision,
  dirty,
  onOpenRow,
}: {
  batchId: string;
  rowId: string;
  revision: number;
  dirty: boolean;
  onOpenRow: (id: string) => void;
}) {
  const [report, setReport] = useState<RegistryDuplicateReport | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    setReport(null);
    fetch(
      "/api/imports/" +
        encodeURIComponent(batchId) +
        "/rows/" +
        encodeURIComponent(rowId) +
        "/duplicates?page=" +
        page +
        "&limit=5",
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Không tải được hồ sơ đối chiếu.");
        if (active) {
          if (page > 1 && !result.matches.length) {
            setPage(1);
            return;
          }
          setReport(result);
          setSelected(result.matches[0]?.key || "");
        }
      })
      .catch((failure: unknown) => {
        if (active && !controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Không tải được hồ sơ đối chiếu.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [batchId, rowId, revision, page, retry]);
  const match = report?.matches.find((item) => item.key === selected);
  return (
    <section
      className={styles.panel}
      aria-labelledby="registry-duplicate-title"
      aria-busy={loading}
    >
      <h3 id="registry-duplicate-title">Đối chiếu hồ sơ trùng</h3>
      <p className={styles.description}>
        Đối chiếu MSSV và số văn bằng trong đợt nhập; kiểm tra số hiệu, số vào
        sổ với văn bằng đã lưu trong hệ thống. Không tự gộp hoặc xóa hồ sơ.
      </p>
      {dirty && (
        <Alert
          type="info"
          showIcon
          title="Anh/chị đang có thay đổi chưa lưu. Bảng đối chiếu sẽ cập nhật sau khi chọn Kiểm tra và lưu đối soát."
        />
      )}
      {loading ? (
        <div className={styles.loading} role="status">
          <Spin size="small" /> Đang tìm hồ sơ trùng…
        </div>
      ) : error ? (
        <Alert
          type="error"
          showIcon
          title="Chưa thể đối chiếu"
          description={error}
          action={
            <Button onClick={() => setRetry((value) => value + 1)}>
              Thử lại
            </Button>
          }
        />
      ) : (
        report && (
          <>
            <p className={styles.location}>
              Nguồn: <strong>{report.current.fileName}</strong> · Sheet{" "}
              <strong>{report.current.sheetName}</strong> · Dòng{" "}
              <strong>{report.current.rowNumber}</strong>
            </p>
            {report.fields.length ? (
              <Space wrap className={styles.summary}>
                {report.fields.map((field) => (
                  <Tag
                    key={field.field}
                    color={field.field === "studentCode" ? "orange" : "red"}
                  >
                    {field.label}: {field.value}
                  </Tag>
                ))}
              </Space>
            ) : (
              <p className={styles.empty}>
                Không phát hiện trùng MSSV, số hiệu hoặc số vào sổ trong phạm vi
                đối chiếu. Đây không phải kết luận hồ sơ đã đủ điều kiện phát
                hành.
              </p>
            )}
            {report.fields.some((field) => field.field === "studentCode") && (
              <p className={styles.description}>
                Trùng MSSV là lưu ý cần đối chiếu: một người có thể có nhiều văn
                bằng. Trùng số hiệu hoặc số vào sổ phải xử lý trước khi lưu hồ
                sơ mới.
              </p>
            )}
            {report.restrictedCount > 0 && (
              <Alert
                type="warning"
                showIcon
                title="Có số văn bằng đã tồn tại ngoài phạm vi cơ sở của tài khoản này."
                description="Không hiển thị dữ liệu cá nhân ngoài phạm vi. Vui lòng liên hệ bộ phận quản lý để đối chiếu; cảnh báo trùng vẫn được giữ."
              />
            )}
            {!!report.total && (
              <>
                <label
                  className={styles.label}
                  htmlFor="registry-duplicate-selection"
                >
                  Hồ sơ liên quan ({report.total})
                </label>
                <Select
                  id="registry-duplicate-selection"
                  className={styles.selector}
                  value={selected || undefined}
                  onChange={setSelected}
                  options={report.matches.map((item) => ({
                    value: item.key,
                    label:
                      (item.kind === "row"
                        ? "Sheet " +
                          item.sheetName +
                          " · Dòng " +
                          item.rowNumber
                        : "Hồ sơ trong hệ thống") +
                      " · " +
                      (item.values.fullName || "Chưa có họ tên"),
                  }))}
                />
                {match && (
                  <>
                    <div className={styles.tableScroll}>
                      <table className={styles.table}>
                        <caption>
                          So sánh hồ sơ đang kiểm tra với hồ sơ liên quan.
                          Trường gây trùng và các giá trị khác nhau được đánh
                          dấu riêng.
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Thông tin</th>
                            <th scope="col">Đang kiểm tra</th>
                            <th scope="col">Hồ sơ liên quan</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <th scope="row">Vị trí</th>
                            <td>
                              Sheet {report.current.sheetName} · Dòng{" "}
                              {report.current.rowNumber}
                            </td>
                            <td>
                              {match.kind === "row" ? (
                                <>
                                  Sheet {match.sheetName} · Dòng{" "}
                                  {match.rowNumber}
                                </>
                              ) : (
                                "Đã có trong hệ thống"
                              )}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">Trạng thái</th>
                            <td>
                              {registryDuplicateStatus(report.current.status)}
                            </td>
                            <td>
                              {registryDuplicateStatus(
                                match.diplomaStatus || match.status,
                              )}
                              {match.workflowStatus && (
                                <>
                                  {" "}
                                  ·{" "}
                                  {registryDuplicateStatus(
                                    match.workflowStatus,
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                          {registryComparisonFields.map(([field, label]) => {
                            const current = registryComparisonValue(
                              report.current.values,
                              field,
                            );
                            const other = registryComparisonValue(
                              match.values,
                              field,
                            );
                            const duplicate =
                              match.matchedFields.includes(field);
                            const different = current !== other;
                            return (
                              <tr
                                key={field}
                                className={
                                  duplicate
                                    ? styles.duplicate
                                    : different
                                      ? styles.different
                                      : undefined
                                }
                              >
                                <th scope="row">
                                  {label}
                                  {duplicate ? (
                                    <span className={styles.marker}>
                                      Gây trùng
                                    </span>
                                  ) : different ? (
                                    <span className={styles.marker}>
                                      Khác nhau
                                    </span>
                                  ) : null}
                                </th>
                                <td>{current}</td>
                                <td>{other}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className={styles.actions}>
                      {match.kind === "row" && (
                        <Button onClick={() => onOpenRow(match.id)}>
                          Mở dòng {match.rowNumber} để kiểm tra
                        </Button>
                      )}
                      {(match.kind === "diploma" ||
                        match.status === "IMPORTED") && (
                        <Link
                          target="_blank"
                          rel="noopener noreferrer"
                          href={
                            "/certificates?search=" +
                            encodeURIComponent(
                              match.values.certificateNo ||
                                match.values.registryNo ||
                                "",
                            )
                          }
                        >
                          Mở hồ sơ trong Sổ văn bằng ↗
                        </Link>
                      )}
                    </div>
                  </>
                )}
                {report.total > report.limit && (
                  <Pagination
                    size="small"
                    current={page}
                    pageSize={report.limit}
                    total={report.total}
                    showSizeChanger={false}
                    onChange={setPage}
                  />
                )}
              </>
            )}
          </>
        )
      )}
    </section>
  );
}
