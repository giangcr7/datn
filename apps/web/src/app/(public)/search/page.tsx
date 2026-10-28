"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  degreeLabels,
  emptyLookupFields,
  lookupDate,
  lookupGroups,
  lookupStatus,
  lookupVerificationHref,
  requestDiplomaLookup,
  validateLookupFields,
  type DiplomaLookupResult,
  type LookupErrors,
  type LookupField,
  type LookupFields,
} from "@/lib/diploma-lookup";
import styles from "./page.module.css";

export default function SearchPage() {
  const [fields, setFields] = useState<LookupFields>(emptyLookupFields);
  const [errors, setErrors] = useState<LookupErrors>({});
  const [results, setResults] = useState<DiplomaLookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
    },
    [],
  );

  function clearSearch() {
    sequence.current++;
    controller.current?.abort();
    setLoading(false);
    setResults([]);
    setSearched(false);
    setError("");
    setErrors({});
  }

  function changeField(key: LookupField, value: string) {
    clearSearch();
    setFields((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    clearSearch();
    setFields(emptyLookupFields());
    document.getElementById("lookup-fullName")?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearSearch();
    const issues = validateLookupFields(fields);
    setErrors(issues);
    if (Object.keys(issues).length) {
      const first = lookupGroups
        .flatMap((group) => group.fields)
        .find((field) => issues[field.key]);
      if (first) document.getElementById("lookup-" + first.key)?.focus();
      return;
    }
    const requestId = sequence.current;
    const activeController = new AbortController();
    controller.current = activeController;
    setLoading(true);
    try {
      const matches = await requestDiplomaLookup(
        fields,
        activeController.signal,
      );
      if (sequence.current !== requestId) return;
      setResults(matches);
      setSearched(true);
      requestAnimationFrame(() => resultsHeading.current?.focus());
    } catch (failure) {
      if (sequence.current !== requestId || activeController.signal.aborted)
        return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Không thể tra cứu. Vui lòng thử lại.",
      );
    } finally {
      if (sequence.current === requestId) setLoading(false);
    }
  }

  return (
    <div className={styles.page + " " + styles.container + " " + styles.main}>
      <nav className={styles.breadcrumb} aria-label="Vị trí trang">
        <Link href="/">Trang chủ</Link>
        <span aria-hidden="true">/</span>
        <span>Tra cứu văn bằng</span>
      </nav>
      <div className={styles.introduction}>
        <h1>Tra cứu văn bằng tốt nghiệp</h1>
        <p>Vui lòng nhập thông tin để tra cứu</p>
      </div>

      <form
        className={styles.form}
        onSubmit={submit}
        noValidate
        aria-labelledby="form-title"
        aria-describedby="lookup-instructions"
      >
        <div className={styles.formHeading}>
          <h2 id="form-title">Thông tin tra cứu</h2>
          <span>
            Dấu <b aria-hidden="true">*</b> là thông tin bắt buộc
          </span>
        </div>
        <div className={styles.instructions} id="lookup-instructions">
          <strong>
            Nhập họ tên, ngày sinh và ít nhất một trong ba thông tin: MSSV, số
            hiệu hoặc số vào sổ.
          </strong>
          <p>
            Các ô còn lại không bắt buộc. Nếu nhập thêm, tất cả thông tin phải
            cùng khớp với văn bằng. Họ tên và tên ngành có thể nhập không dấu,
            không phân biệt chữ hoa/thường.
          </p>
        </div>
        {lookupGroups.map((group) => (
          <fieldset className={styles.fieldset} key={group.title}>
            <legend>{group.title}</legend>
            <div className={styles.fields}>
              {group.fields.map((field) => {
                const id = "lookup-" + field.key;
                const errorId = id + "-error";
                const controlProps = {
                  id,
                  name: field.key,
                  value: fields[field.key],
                  required: field.required,
                  "aria-invalid": errors[field.key]
                    ? (true as const)
                    : undefined,
                  "aria-describedby": errors[field.key] ? errorId : undefined,
                  onChange: (
                    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
                  ) => changeField(field.key, event.target.value),
                };
                return (
                  <div className={styles.field} key={field.key}>
                    <label htmlFor={id}>
                      {field.label}
                      {field.required && (
                        <span className={styles.required} aria-hidden="true">
                          {" "}
                          *
                        </span>
                      )}
                    </label>
                    {field.kind === "select" ? (
                      <select {...controlProps}>
                        <option value="">Không giới hạn</option>
                        {field.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        {...controlProps}
                        type={field.kind === "date" ? "date" : "text"}
                        inputMode={
                          field.kind === "year"
                            ? "numeric"
                            : field.kind === "decimal"
                              ? "decimal"
                              : undefined
                        }
                        maxLength={field.maxLength}
                        placeholder={field.placeholder}
                        autoComplete={
                          field.key === "fullName"
                            ? "name"
                            : field.key === "dob"
                              ? "bday"
                              : "off"
                        }
                      />
                    )}
                    {errors[field.key] && (
                      <p className={styles.fieldError} id={errorId}>
                        {errors[field.key]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
        {Object.keys(errors).length > 0 && (
          <p className={styles.error} role="alert">
            Thông tin chưa đầy đủ hoặc chưa hợp lệ. Vui lòng kiểm tra các ô được
            đánh dấu.
          </p>
        )}
        <div className={styles.actions}>
          <button
            className={styles.resetButton}
            type="button"
            onClick={resetForm}
            aria-label="Nhập lại thông tin"
            title="Nhập lại thông tin"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 10a8 8 0 1 1 1.5 7M4 10V4m0 6h6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={loading}
          >
            {loading ? "Đang tra cứu…" : "Tra cứu thông tin"}
          </button>
          <span>Không cần đăng nhập để tra cứu theo thông tin cá nhân.</span>
        </div>
      </form>

      <section
        className={styles.results}
        aria-labelledby="results-title"
        aria-busy={loading}
      >
        <h2 id="results-title" ref={resultsHeading} tabIndex={-1}>
          Kết quả tra cứu
        </h2>
        <div aria-live="polite" role="status">
          {loading && (
            <p className={styles.waiting}>
              Đang đối chiếu thông tin trong kho văn bằng…
            </p>
          )}
          {!loading && !searched && !error && (
            <p className={styles.waiting}>
              Kết quả sẽ hiển thị sau khi bạn nhập thông tin và chọn “Tra cứu
              thông tin”.
            </p>
          )}
          {!loading && searched && results.length === 0 && (
            <div className={styles.empty}>
              <strong>Không tìm thấy văn bằng phù hợp</strong>
              <p>
                Kiểm tra lại họ tên, ngày sinh và số định danh. Thử bỏ các ô bổ
                sung nếu chưa chắc chắn; văn bằng chưa phát hành sẽ không xuất
                hiện tại đây.
              </p>
            </div>
          )}
          {!loading && searched && results.length > 0 && (
            <p className={styles.resultCount}>
              Tìm thấy <strong>{results.length}</strong> văn bằng phù hợp.
              {results.length === 20 &&
                " Đang hiển thị tối đa 20 kết quả; bổ sung năm hoặc số hiệu để thu hẹp."}
            </p>
          )}
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {!loading &&
          results.map((diploma) => {
            const status = lookupStatus(diploma.status);
            return (
              <article className={styles.resultCard} key={diploma.uuid}>
                <div className={styles.resultHeading}>
                  <h3>{diploma.fullName}</h3>
                  <span className={styles.badge + " " + styles[status.tone]}>
                    {status.label}
                  </span>
                </div>
                <dl className={styles.resultDetails}>
                  {[
                    ["Mã số sinh viên", diploma.mssv],
                    ["Số hiệu văn bằng", diploma.soHieu],
                    ["Số vào sổ", diploma.soVaoSo],
                    ["Lớp", diploma.className],
                    ["Ngành đào tạo", diploma.major],
                    [
                      "Trình độ",
                      diploma.degreeType
                        ? degreeLabels[diploma.degreeType] || diploma.degreeType
                        : null,
                    ],
                    ["Năm tốt nghiệp", diploma.namTotNghiep],
                    ["Xếp loại", diploma.grade],
                    ["Ngày cấp", lookupDate(diploma.issueDate)],
                    ["Số quyết định tốt nghiệp", diploma.decisionNo],
                    ["Ngày quyết định", lookupDate(diploma.decisionDate)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value ?? "Chưa ghi nhận"}</dd>
                    </div>
                  ))}
                </dl>
                {diploma.status === "REVOKED" && (
                  <p className={styles.statusNote}>
                    Văn bằng này đã bị thu hồi. Không sử dụng kết quả tra cứu để
                    xác nhận văn bằng còn hiệu lực.
                  </p>
                )}
                {diploma.status === "REPLACED" && (
                  <p className={styles.statusNote}>
                    Văn bằng này đã được thay thế. Vui lòng kiểm tra và sử dụng
                    thông tin văn bằng thay thế.
                  </p>
                )}
                <Link
                  className={styles.verifyLink}
                  href={lookupVerificationHref(diploma.uuid)}
                >
                  Kiểm tra tình trạng văn bằng <span aria-hidden="true">→</span>
                </Link>
              </article>
            );
          })}
      </section>
      <aside className={styles.notice}>
        <strong>Lưu ý khi sử dụng kết quả</strong>
        <p>
          Tra cứu giúp tìm thông tin lưu trữ, không thay thế việc xác thực tệp
          văn bằng. Nếu cần kiểm tra tệp PDF hoặc mã QR, sử dụng{" "}
          <Link href="/verify">chức năng xác thực văn bằng</Link>.
        </p>
        <p>
          Thông tin không khớp hoặc không nhớ số định danh?{" "}
          <Link href="/login?type=student">Đăng nhập tài khoản sinh viên</Link>{" "}
          hoặc liên hệ bộ phận quản lý văn bằng của nhà trường.
        </p>
      </aside>
    </div>
  );
}
