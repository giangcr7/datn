import type { AssistantSource } from "./diploma-assistant";

export interface AssistantGuide extends AssistantSource {
  question: string;
  body: string;
  steps: string[];
  keywords: string[];
  staffOnly?: boolean;
  issueCodes?: string[];
}

export const assistantGuides: AssistantGuide[] = [
  {
    id: "lookup",
    title: "Hướng dẫn tra cứu văn bằng",
    href: "/search",
    question: "Tra cứu thông tin văn bằng trong kho như thế nào?",
    body: "Tra cứu khác với xác thực. Form tra cứu yêu cầu họ tên, ngày sinh và ít nhất một trong MSSV, số hiệu, số vào sổ. Các trường đào tạo và văn bằng khác là tùy chọn; nếu nhập thì phải khớp. Chatbot không tra cứu hoặc cung cấp dữ liệu cá nhân.",
    steps: [
      "Mở Tra cứu văn bằng, nhập họ tên và ngày sinh.",
      "Nhập ít nhất một số định danh: MSSV, số hiệu hoặc số vào sổ; bổ sung các thông tin khác nếu có.",
      "Nhấn Tra cứu thông tin. Muốn kiểm tra tệp PDF hoặc QR, chuyển sang Xác thực văn bằng.",
    ],
    keywords: [
      "tra cuu",
      "tim bang",
      "tim van bang",
      "thong tin van bang",
      "nhap nhung gi",
      "nhap gi",
      "mssv",
      "so hieu",
      "so vao so",
      "khong tim thay",
    ],
  },
  {
    id: "verify",
    title: "Hướng dẫn xác thực PDF và mã QR",
    href: "/verify",
    question: "Xác thực PDF hoặc mã QR khác tra cứu như thế nào?",
    body: "Cổng xác thực có tải tệp PDF và quét mã QR, không yêu cầu nhập mã proof. PDF tối đa 10 MB. Kết quả do bộ kiểm tra của hệ thống trả về; trợ lý không kiểm tra tệp, không kết luận một văn bằng có hợp lệ hay không. Tìm thấy hồ sơ không thay thế xác thực PDF. QR mở thông tin liên kết, không thay thế kiểm tra nội dung tệp PDF.",
    steps: [
      "Mở Xác thực văn bằng và chọn Xác thực tệp PDF hoặc Quét mã QR.",
      "Tải tệp PDF do hệ thống cấp, tối đa 10 MB; hoặc cho phép camera để quét QR.",
      "Đọc trạng thái trên màn hình xác thực. Nếu cần kiểm tra tính toàn vẹn của tệp, dùng chính tệp PDF đó.",
    ],
    keywords: [
      "xac thuc",
      "kiem tra bang",
      "kiem tra van bang",
      "pdf",
      "ma qr",
      "quet qr",
      "proof",
      "prof",
      "hop le",
      "that hay gia",
      "camera",
    ],
  },
  {
    id: "account",
    title: "Đăng nhập và tải văn bằng cá nhân",
    href: "/login?type=student",
    question: "Sinh viên đăng nhập, kích hoạt tài khoản và tải PDF ở đâu?",
    body: "Sinh viên dùng tài khoản được nhà trường cấp hoặc kích hoạt bằng MSSV và email đã đăng ký theo quy trình OTP. Văn bằng của tôi có tải PDF ký số khi có bản phát hành được phép tải. Trợ lý không đọc tài khoản, không cấp lại mật khẩu và không biết tiến độ của một văn bằng cụ thể.",
    steps: [
      "Mở Đăng nhập, chọn Sinh viên; nếu chưa kích hoạt, chọn Kích hoạt ngay và làm theo hướng dẫn OTP.",
      "Sau đăng nhập, mở Văn bằng của tôi để xem văn bằng và tải PDF ký số được phép tải.",
      "Nếu không đăng nhập được hoặc chưa thấy văn bằng, liên hệ bộ phận quản lý văn bằng; không gửi mật khẩu hay OTP vào chat.",
    ],
    keywords: [
      "dang nhap",
      "tai khoan",
      "kich hoat",
      "otp",
      "mat khau",
      "tai pdf",
      "tai bang",
      "tai van bang",
      "van bang cua toi",
      "bang cua toi",
      "duoc cap chua",
    ],
  },
  {
    id: "workflow",
    title: "Quy trình hồ sơ cấp văn bằng",
    href: "/diploma-records",
    staffOnly: true,
    question:
      "Một cán bộ tại cơ sở chính xử lý hồ sơ và phát hành như thế nào?",
    body: "Mô hình một cơ sở chính TP.HCM, một cán bộ xử lý. Không gửi hồ sơ sang Hà Nội hay người duyệt khác. Nhập hồ sơ, kiểm tra dữ liệu, duyệt và ký số, chờ blockchain xác nhận. Duyệt không đồng nghĩa giao dịch đã commit. Hồ sơ đã ký hoặc đã phát hành không được ghi đè PDF; sửa sai theo hồ sơ thay thế.",
    steps: [
      "Mở Hồ sơ cấp văn bằng để nhập hồ sơ và kiểm tra dữ liệu.",
      "Chỉ duyệt và phát hành khi hồ sơ đủ điều kiện; kiểm tra trạng thái blockchain tại Đối chiếu blockchain.",
      "Quản lý bản đã phát hành tại Sổ văn bằng. Nếu sai thông tin, dùng luồng sửa sai và phát hành thay thế.",
    ],
    keywords: [
      "quy trinh",
      "duyet",
      "phat hanh",
      "ha noi",
      "co so",
      "cho blockchain",
      "thay the",
      "tu choi",
    ],
  },
  {
    id: "program",
    title: "Danh mục ngành và ánh xạ tên ngành",
    href: "/catalog",
    staffOnly: true,
    question: "Vì sao ngành chưa được ánh xạ vào danh mục được phê duyệt?",
    body: "UNMAPPED_PROGRAM nghĩa là tên ngành nhập chưa ánh xạ tới ngành được phê duyệt. Đối chiếu ngành chính thức và tên ngành trong tệp, bổ sung ngành hoặc ánh xạ phù hợp theo thẩm quyền. Không chọn đại một ngành để bỏ lỗi. Thay đổi danh mục không tự sửa PDF đã ký.",
    steps: [
      "Mở Danh mục, đối chiếu ngành chính thức và tên ngành trong tệp nguồn.",
      "Bổ sung hoặc điều chỉnh ánh xạ đúng ngành theo thẩm quyền; không tự suy đoán ngành tương đương.",
      "Quay lại Kiểm tra dữ liệu, chọn đúng đợt và kiểm tra lại trước khi lưu.",
    ],
    keywords: [
      "anh xa",
      "ten nganh",
      "danh muc",
      "nganh chua",
      "unmapped_program",
    ],
    issueCodes: ["UNMAPPED_PROGRAM"],
  },
  {
    id: "dates",
    title: "Đối soát ngày sinh, ngày quyết định và ngày cấp",
    href: "/import",
    staffOnly: true,
    question: "Cần xử lý các lỗi ngày tháng trong hồ sơ như thế nào?",
    body: "Ngày sinh phải hợp lệ và không ở tương lai. Ngày ký quyết định/ngày cấp phải là ngày hợp lệ, không ở tương lai hoặc trước ngày sinh; ngày cấp không trước năm tốt nghiệp. Thiếu ngày cấp phải bổ sung từ nguồn có thẩm quyền, không dùng ngày hiện tại để lấp chỗ trống.",
    steps: [
      "Đối chiếu ngày tháng với tệp nguồn và quyết định được phê duyệt.",
      "Mở dòng hồ sơ tại Kiểm tra dữ liệu để bổ sung hoặc sửa đúng trường ngày tháng.",
      "Kiểm tra lại các lỗi trước khi lưu; không tự đặt ngày cấp khi chưa có căn cứ.",
    ],
    keywords: [
      "ngay cap",
      "ngay sinh",
      "ngay quyet dinh",
      "ngay thang",
      "ngay ky",
      "tuong lai",
    ],
    issueCodes: [
      "ISSUE_DATE_NOT_IN_SOURCE",
      "INVALID_DOCUMENT_DATE",
      "INVALID_BIRTH_DATE",
    ],
  },
  {
    id: "numbers",
    title: "Đối soát số hiệu và số vào sổ",
    href: "/import",
    staffOnly: true,
    question: "Thiếu hoặc trùng số hiệu, số vào sổ phải xử lý ra sao?",
    body: "Số hiệu và số vào sổ phải được đối soát đầy đủ. Thiếu cả hai hoặc chỉ có một số cần bổ sung. Nếu bị báo trùng trong tệp hoặc với dữ liệu đã lưu, phải kiểm tra hồ sơ nguồn và Sổ văn bằng; không sửa tùy tiện để vượt kiểm tra, không xóa văn bằng cũ.",
    steps: [
      "Đối chiếu số hiệu và số vào sổ với sổ cấp văn bằng và tệp nguồn.",
      "Nếu thiếu thì bổ sung đúng số; nếu trùng thì kiểm tra xem là nhập lại hồ sơ hay sai dữ liệu nguồn.",
      "Cán bộ xác nhận cách xử lý phù hợp rồi kiểm tra lại; không tự phát sinh số thay thế.",
    ],
    keywords: [
      "trung so",
      "thieu so",
      "trung lap",
      "duplicate",
      "not_yet_issued",
      "incomplete_diploma_numbers",
    ],
    issueCodes: [
      "NOT_YET_ISSUED",
      "INCOMPLETE_DIPLOMA_NUMBERS",
      "EXISTING_CERTIFICATE_NO",
      "EXISTING_REGISTRY_NO",
      "EXISTING_NUMBER",
      "DUPLICATE_NUMBER",
    ],
  },
  {
    id: "grades",
    title: "Đối soát điểm và xếp loại",
    href: "/import",
    staffOnly: true,
    question: "Điểm trung bình, thang điểm và xếp loại cần kiểm tra thế nào?",
    body: "GPA phải là số trong khoảng 0 đến thang điểm đã khai báo. Chỉ nhận thang điểm 4 hoặc 10. Xếp loại phải được xác nhận độc lập theo nguồn được phê duyệt, không tự suy từ GPA.",
    steps: [
      "Kiểm tra GPA và thang điểm 4 hoặc 10 trong nguồn dữ liệu.",
      "Đối chiếu xếp loại theo hồ sơ/quyết định, không nhờ AI tính xếp loại thay nhà trường.",
      "Sửa trường sai ở Kiểm tra dữ liệu và kiểm tra lại.",
    ],
    keywords: ["diem", "gpa", "xep loai", "thang diem"],
    issueCodes: [
      "INVALID_GPA",
      "INVALID_GPA_SCALE",
      "INVALID_CLASSIFICATION",
      "GPA_IN_CLASSIFICATION",
      "SWAPPED_YEAR_CLASSIFICATION",
      "GPA_COLUMN_REALIGNMENT",
    ],
  },
  {
    id: "print",
    title: "Kiểm tra thông tin in trên văn bằng",
    href: "/import",
    staffOnly: true,
    question:
      "Thiếu thông tin in trên văn bằng hoặc giá trị không hợp lệ phải làm gì?",
    body: "Các trường in phải được đối chiếu như loại bằng, tên ngành tiếng Anh, nơi cấp, người ký và chức danh. Trường quá dài hoặc không thuộc danh mục cần sửa theo nguồn. Trợ lý không tự dịch tên ngành chính thức, không tự điền người ký và không được ghi đè bản đã ký.",
    steps: [
      "Xem trường đang bị báo lỗi tại dòng hồ sơ.",
      "Đối chiếu nguồn đã phê duyệt và bổ sung đúng thông tin tại Kiểm tra dữ liệu.",
      "Nếu văn bằng đã phát hành, chuyển sang luồng sửa sai và phát hành thay thế thay vì sửa PDF cũ.",
    ],
    keywords: [
      "thieu thong tin in",
      "nguoi ky",
      "chuc danh",
      "loai bang",
      "noi cap",
      "tieng anh",
      "qua dai",
    ],
    issueCodes: [
      "MISSING_PRINT_FIELD",
      "VALUE_TOO_LONG",
      "INVALID_DEGREE_TYPE",
      "INVALID_GENDER",
    ],
  },
  {
    id: "review",
    title: "Hướng dẫn rà soát dữ liệu nguồn",
    href: "/import",
    staffOnly: true,
    question:
      "Dòng dữ liệu cần rà soát hoặc chưa tạo được hồ sơ văn bằng phải xử lý thế nào?",
    body: "Các lỗi không nằm trong hướng dẫn chuyên biệt cần được đối chiếu tại Kiểm tra dữ liệu. Kiểm tra tệp, sheet, dòng và trường bị báo lỗi, xác nhận thông tin theo thẩm quyền rồi kiểm tra lại. Không suy ra đã đủ điều kiện chỉ vì lưu được bản ghi. Không gửi thông tin cá nhân của dòng dữ liệu vào chat.",
    steps: [
      "Mở đúng đợt và dòng hồ sơ ở Kiểm tra dữ liệu, đọc thông báo của bộ kiểm tra.",
      "Đối chiếu tệp nguồn hoặc quyết định; cán bộ bổ sung/sửa có căn cứ và lý do.",
      "Chọn kiểm tra lại. Chỉ chuyển sang duyệt khi hệ thống xác nhận đủ điều kiện.",
    ],
    keywords: [
      "kiem tra du lieu",
      "loi ho so",
      "loi excel",
      "can ra soat",
      "sua loi",
      "bo sung",
      "loi nhap",
      "cong thuc",
    ],
    issueCodes: [
      "SUBMISSION",
      "MISSING_ORDINAL",
      "EXTERNAL_FORMULA_CACHE",
      "MISSING_FORMULA_CACHE",
      "EXCEL_ERROR",
      "YEAR_FROM_SHEET",
      "COLUMN_REALIGNMENT",
      "INVALID_STUDENT_CODE",
      "INVALID_NAME",
      "INVALID_GRADUATION_YEAR",
      "COMMIT_CONFLICT",
    ],
  },
];

export function normalizeAssistantText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function selectAssistantGuides(
  question: string,
  codes: string[],
  staff: boolean,
) {
  const allowed = assistantGuides.filter((guide) => staff || !guide.staffOnly);
  if (codes.length) {
    const selected = allowed.filter((guide) =>
      guide.issueCodes?.some((code) => codes.includes(code)),
    );
    return (
      selected.length
        ? selected
        : allowed.filter((guide) => guide.id === "review")
    ).slice(0, 3);
  }
  const normalized = normalizeAssistantText(question);
  return allowed
    .map((guide) => ({
      guide,
      score: guide.keywords.reduce(
        (score, keyword) =>
          score +
          (normalized.includes(keyword) ? keyword.split(" ").length : 0),
        0,
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((item) => item.guide);
}
