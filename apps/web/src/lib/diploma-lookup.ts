export const degreeLabels: Record<string, string> = {
  BACHELOR: "Cử nhân",
  ENGINEER: "Kỹ sư",
  MASTER: "Thạc sĩ",
  DOCTOR: "Tiến sĩ",
  OTHER: "Khác",
};
export const classificationLabels = [
  "Xuất sắc",
  "Giỏi",
  "Khá",
  "Trung bình khá",
  "Trung bình",
];

export type LookupField =
  | "fullName"
  | "dob"
  | "mssv"
  | "className"
  | "major"
  | "degreeType"
  | "namTotNghiep"
  | "grade"
  | "gpa"
  | "soHieu"
  | "soVaoSo"
  | "issueDate"
  | "decisionNo"
  | "decisionDate";
export type LookupFields = Record<LookupField, string>;
export type LookupErrors = Partial<Record<LookupField, string>>;
export type LookupFieldDefinition = {
  key: LookupField;
  label: string;
  kind?: "date" | "year" | "decimal" | "select";
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
};
export const lookupGroups: {
  title: string;
  fields: LookupFieldDefinition[];
}[] = [
  {
    title: "Thông tin người được cấp văn bằng",
    fields: [
      {
        key: "fullName",
        label: "Họ và tên",
        required: true,
        maxLength: 255,
        placeholder: "Nhập đầy đủ họ và tên",
      },
      { key: "dob", label: "Ngày sinh", kind: "date", required: true },
      {
        key: "mssv",
        label: "Mã số sinh viên",
        maxLength: 40,
        placeholder: "Giữ nguyên số 0 ở đầu mã",
      },
    ],
  },
  {
    title: "Thông tin đào tạo và tốt nghiệp",
    fields: [
      {
        key: "className",
        label: "Lớp",
        maxLength: 100,
        placeholder: "Nhập tên hoặc mã lớp trên hồ sơ",
      },
      {
        key: "major",
        label: "Ngành đào tạo",
        maxLength: 255,
        placeholder: "Nhập đầy đủ tên ngành trên văn bằng",
      },
      {
        key: "degreeType",
        label: "Trình độ văn bằng",
        kind: "select",
        options: Object.entries(degreeLabels).map(([value, label]) => ({
          value,
          label,
        })),
      },
      {
        key: "namTotNghiep",
        label: "Năm tốt nghiệp",
        kind: "year",
        maxLength: 4,
        placeholder: "Ví dụ: 2025",
      },
      {
        key: "grade",
        label: "Xếp loại tốt nghiệp",
        kind: "select",
        options: classificationLabels.map((label) => ({ value: label, label })),
      },
      {
        key: "gpa",
        label: "Điểm trung bình (thang điểm gốc)",
        kind: "decimal",
        maxLength: 5,
        placeholder: "Ví dụ: 3,25 hoặc 8,50",
      },
    ],
  },
  {
    title: "Thông tin văn bằng và quyết định",
    fields: [
      {
        key: "soHieu",
        label: "Số hiệu văn bằng",
        maxLength: 120,
        placeholder: "Nhập số hiệu trên văn bằng",
      },
      {
        key: "soVaoSo",
        label: "Số vào sổ cấp văn bằng",
        maxLength: 180,
        placeholder: "Nhập số vào sổ cấp văn bằng",
      },
      { key: "issueDate", label: "Ngày cấp văn bằng", kind: "date" },
      {
        key: "decisionNo",
        label: "Số quyết định tốt nghiệp",
        maxLength: 120,
        placeholder: "Nhập đầy đủ số quyết định",
      },
      {
        key: "decisionDate",
        label: "Ngày quyết định tốt nghiệp",
        kind: "date",
      },
    ],
  },
];

export function emptyLookupFields(): LookupFields {
  return Object.fromEntries(
    lookupGroups.flatMap((group) =>
      group.fields.map((field) => [field.key, ""]),
    ),
  ) as LookupFields;
}

function clean(value: string) {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function validateLookupFields(
  fields: LookupFields,
  now = new Date(),
): LookupErrors {
  const errors: LookupErrors = {};
  for (const field of lookupGroups.flatMap((group) => group.fields)) {
    const value = clean(fields[field.key]);
    if (field.required && !value)
      errors[field.key] =
        "Vui lòng nhập " + field.label.toLocaleLowerCase("vi-VN");
    else if (field.maxLength && value.length > field.maxLength)
      errors[field.key] = "Thông tin vượt quá độ dài cho phép";
    else if (value && field.kind === "date" && !validDate(value))
      errors[field.key] = "Ngày không hợp lệ";
    else if (
      value &&
      field.options &&
      !field.options.some((option) => option.value === value)
    )
      errors[field.key] = "Vui lòng chọn một giá trị trong danh sách";
  }
  if (clean(fields.fullName) && clean(fields.fullName).length < 2)
    errors.fullName = "Vui lòng nhập đầy đủ họ và tên";
  if (
    fields.dob &&
    validDate(fields.dob) &&
    new Date(fields.dob + "T00:00:00Z") > now
  )
    errors.dob = "Ngày sinh không được ở tương lai";
  if (!clean(fields.mssv) && !clean(fields.soHieu) && !clean(fields.soVaoSo))
    errors.mssv = "Cần nhập MSSV, số hiệu hoặc số vào sổ cấp văn bằng";
  if (
    clean(fields.mssv) &&
    !/^[a-z0-9][a-z0-9._/-]{1,39}$/i.test(clean(fields.mssv))
  )
    errors.mssv =
      "MSSV gồm 2–40 chữ số hoặc ký tự chữ, dấu chấm, gạch và gạch chéo";
  for (const key of ["soHieu", "soVaoSo"] as const) {
    if (clean(fields[key]) && clean(fields[key]).length < 2)
      errors[key] = "Vui lòng nhập ít nhất 2 ký tự";
  }
  if (
    fields.namTotNghiep &&
    (!/^\d{4}$/.test(clean(fields.namTotNghiep)) ||
      Number(fields.namTotNghiep) < 1900 ||
      Number(fields.namTotNghiep) > 2200)
  )
    errors.namTotNghiep = "Năm tốt nghiệp từ 1900 đến 2200";
  if (
    fields.gpa &&
    (!/^\d{1,2}([.,]\d{1,2})?$/.test(clean(fields.gpa)) ||
      Number(fields.gpa.replace(",", ".")) > 10)
  )
    errors.gpa = "Nhập điểm từ 0 đến 10, tối đa 2 chữ số thập phân";
  return errors;
}

export function lookupPayload(fields: LookupFields) {
  return Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, clean(value)] as const)
      .filter(([, value]) => value !== "")
      .map(([key, value]) => [
        key,
        key === "namTotNghiep" || key === "gpa"
          ? Number(value.replace(",", "."))
          : value,
      ]),
  );
}

export type DiplomaLookupResult = {
  uuid: string;
  fullName: string;
  mssv: string;
  soHieu: string;
  soVaoSo?: string;
  className?: string | null;
  decisionNo?: string | null;
  decisionDate?: string | null;
  major?: string;
  degreeType?: string | null;
  grade?: string | null;
  namTotNghiep?: number;
  issueDate?: string | null;
  status: string;
};

function isLookupResult(value: unknown): value is DiplomaLookupResult {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["uuid", "fullName", "mssv", "soHieu", "status"].every(
    (key) => typeof record[key] === "string",
  );
}

export async function requestDiplomaLookup(
  fields: LookupFields,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<DiplomaLookupResult[]> {
  if (Object.keys(validateLookupFields(fields)).length)
    throw new Error("Vui lòng kiểm tra lại thông tin tra cứu");
  let response: Response;
  try {
    response = await request("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(lookupPayload(fields)),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "Không thể kết nối kho văn bằng. Vui lòng kiểm tra kết nối và thử lại.",
    );
  }
  if (response.status === 429)
    throw new Error(
      "Bạn đã tra cứu nhiều lần. Vui lòng chờ một phút rồi thử lại.",
    );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Kho văn bằng chưa phản hồi đúng. Vui lòng thử lại sau.");
  }
  const data =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!response.ok || data.success !== true)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Chưa thể tra cứu văn bằng. Vui lòng thử lại sau.",
    );
  if (!Array.isArray(data.results) || !data.results.every(isLookupResult))
    throw new Error("Kết quả tra cứu chưa đầy đủ. Vui lòng thử lại sau.");
  return data.results;
}

export function lookupStatus(status: string) {
  if (status === "REVOKED") return { label: "Đã thu hồi", tone: "danger" };
  if (status === "REPLACED")
    return { label: "Đã được thay thế", tone: "warning" };
  if (status === "ON_CHAIN") return { label: "Đã phát hành", tone: "success" };
  return { label: "Chưa hoàn tất phát hành", tone: "warning" };
}

export function lookupDate(value?: string | null) {
  const date = value?.slice(0, 10);
  return date && validDate(date)
    ? date.split("-").reverse().join("/")
    : "Chưa ghi nhận";
}

export function lookupVerificationHref(uuid: string) {
  return "/verify?proof=" + encodeURIComponent(JSON.stringify({ uuid }));
}
