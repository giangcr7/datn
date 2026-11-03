# Báo cáo thống kê và xuất sổ phát hành

## Sử dụng

- **Tổng quan → Báo cáo thống kê**: chọn năm tốt nghiệp, ngành, xếp loại, trạng thái và khoảng ngày cấp; nhấn **Xem báo cáo**. Chuyển bốn tab để xem theo năm, ngành, xếp loại hoặc trạng thái. Xuất Excel hoặc PDF bằng các nút ngay tại đây. Không thêm menu mới.
- **Sổ văn bằng**: áp dụng bộ lọc hiện có, sau đó chọn **Xuất Excel** hoặc **Xuất sổ PDF**. Xuất toàn bộ kết quả lọc, không chỉ trang đang xem.
- Xuất file sử dụng **bộ lọc đã áp dụng**, không lấy các ô đang sửa nhưng chưa nhấn xem/tìm kiếm. Mỗi lần xuất đọc một snapshot CSDL nhất quán mới; nếu dữ liệu thay đổi sau lúc xem, file phản ánh dữ liệu tại thời điểm xuất và có ghi thời gian.
- Excel giới hạn **10.000** văn bằng/lần; PDF giới hạn **1.000** văn bằng/lần. Nếu vượt, hệ thống yêu cầu thu hẹp bộ lọc, không cắt bỏ dữ liệu âm thầm. Thống kê tổng hợp không bị giới hạn bởi kích thước trang danh sách.

## Nội dung xuất

- Báo cáo Excel có năm sheet: tổng hợp, theo năm, theo ngành, theo xếp loại, theo trạng thái. Mỗi nhóm có tổng số, đang hiệu lực, đã thu hồi, đã thay thế. PDF bố trí các nhóm nối tiếp, tự chia trang khi dài.
- Sổ Excel có sheet thông tin nghiệp vụ và sheet đối chiếu blockchain. Giữ họ tên, MSSV, ngày sinh, ngành/lớp, GPA/xếp loại, năm tốt nghiệp, số hiệu, số vào sổ, quyết định/ngày quyết định, ngày cấp, trạng thái và thông tin thu hồi. Sheet đối chiếu giữ nguyên phiên bản, hash dữ liệu, hash PDF đã ký, mã giao dịch phát hành.
- Sổ PDF khổ A4 ngang: bảng nghiệp vụ, phụ lục đối chiếu blockchain và chi tiết lý do thu hồi nếu có. Lặp tiêu đề và đánh số trang; nhúng phông tiếng Việt. Đây là sổ/báo cáo quản lý, không thay thế tệp văn bằng đã ký.
- Các định danh có số 0 đầu giữ kiểu văn bản; GPA bằng 0 không bị bỏ. Nội dung bắt đầu bằng dấu bằng vẫn là văn bản, không tạo công thức Excel. Ngày lịch sử bị thiếu để trống, không tự lấy ngày hiện tại.

## Phạm vi dữ liệu

- Cán bộ cơ sở chính có quyền duyệt và Admin được đọc/xuất trong phạm vi nhà trường của phiên đăng nhập. Sinh viên, doanh nghiệp, cơ sở cũ và người chưa đăng nhập không được truy cập. Admin không có thêm quyền duyệt/ký/thu hồi.
- Chỉ tính văn bằng đã được duyệt, ở trạng thái ACTIVE/REVOKED/SUPERSEDED, có giao dịch ISSUE **COMMITTED của phiên bản mới nhất**. Không tính hồ sơ nháp, chờ duyệt, lỗi/chờ đồng bộ hoặc chỉ có phiên bản cũ đã commit.
- Số liệu là **số văn bằng**, không phải số sinh viên duy nhất. Bản gốc đã thay thế và bản mới đã phát hành là hai bản ghi; phân biệt bằng trạng thái.
- Thông tin và bộ lọc ưu tiên snapshot đã duyệt. Chỉ fallback dữ liệu quan hệ khi snapshot không có trường đó; giá trị null rõ ràng không bị thay bằng dữ liệu mới.
- Khoảng ngày là **ngày cấp ghi trên văn bằng**, gồm cả hai đầu, không phải ngày giao dịch blockchain. Thời điểm xuất hiển thị theo giờ Việt Nam.
- Không gọi Fabric, không ký lại PDF, không ghi/sửa hồ sơ, audit hoặc ledger. Hash/mã giao dịch là bằng chứng đã lưu, **không phải kết quả đối chiếu blockchain trực tiếp**; dùng menu Đối chiếu blockchain khi cần kiểm tra mạng.
- API và proxy trả header private/no-store; không lưu file xuất trên máy chủ. File tải về chứa thông tin cá nhân, cần được nhà trường bảo quản và chia sẻ đúng phạm vi.

## API / Postman

Base API local: `http://localhost:3001/api`. Dùng Bearer token cán bộ/Admin. Các lệnh GET không có JSON body.

```http
GET /api/reports/overview?year=2024&status=ON_CHAIN
Authorization: Bearer <access_token>

GET /api/reports/export?kind=statistics&format=xlsx&year=2024
Authorization: Bearer <access_token>

GET /api/reports/export?kind=register&format=pdf&issuedFrom=2024-01-01&issuedTo=2024-12-31
Authorization: Bearer <access_token>
```

Các filter tùy chọn: `search`, `year`, `major`, `grade`, `decision`, `status`, `issuedFrom`, `issuedTo`. `grade` nhận Xuất sắc/Giỏi/Khá/Trung bình khá/Trung bình (URL-encode tiếng Việt). `status` nhận ON_CHAIN/REVOKED/REPLACED. Định dạng xuất chỉ xlsx/pdf. `page`/`limit` được chấp nhận để tương thích sổ nhưng không giới hạn file xuất. Không nhận institutionId từ người gọi.

## Kiểm thử

```powershell
npm test -w api -- --runInBand --no-cache reports.spec.ts diploma-register.spec.ts dashboard.service.spec.ts
node scripts/test-reports.mjs
npm run build -w api
node scripts/test-diploma-register-db.mjs
npm run build -w @diploma-chain/web
node scripts/test-reports-web.mjs
node scripts/test-business-menu-web.mjs
```

- Kiểm thử database dùng transaction rollback với hai nhà trường giả, kiểm tra SQL thật, phân quyền HTTP, snapshot, bộ lọc, số đếm và file xuất. Chạy trên CSDL kiểm thử PostgreSQL có đủ migrations, múi giờ máy chủ UTC như cấu hình Docker; không dùng ledger thật.
- Kiểm thử Excel/PDF tạo dữ liệu giả trong bộ nhớ, đọc lại workbook và trích xuất PDF để kiểm tra ký tự Việt, định danh, hash, phân trang, lý do dài và biên trang. Mặc định không lưu file.
- Kiểm thử web chạy Next production trên cổng ngẫu nhiên và backend giả, không đăng nhập/ghi dữ liệu thật. Có thể bật kiểm thử trình duyệt bằng `REPORT_BROWSER_MODULE` (đường dẫn tuyệt đối tới module playwright-core) và `REPORT_BROWSER_EXECUTABLE` (Chrome/Edge). Trình duyệt dùng profile tạm và được đóng/dọn trong finally.
- Nếu chủ động rà hình ảnh, đặt `REPORT_TEST_PREVIEW_DIR` vào thư mục tác vụ dưới OS temp. Chỉ sinh dữ liệu giả/ảnh xem trước ở đó và xóa sau khi rà; không commit file xuất hoặc ảnh.
