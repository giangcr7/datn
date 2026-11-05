# Tìm kiếm nhanh trong Sổ văn bằng

## Sử dụng

Đăng nhập tài khoản cán bộ cơ sở chính có quyền duyệt, mở **Sổ văn bằng** và dùng
ô **Tìm kiếm nhanh**. Admin được xem theo quyền hiện có.

- Nhập MSSV, số hiệu, số vào sổ hoặc họ tên vào cùng một ô.
- Hỗ trợ có dấu/không dấu, chữ hoa/thường, khoảng trắng và đảo thứ tự từ.
  Ví dụ: `Đặng Thị Ánh`, `dang anh`, hoặc `anh 001234`.
- Từ 2 ký tự, ngừng gõ 300 ms sẽ tải tối đa 6 gợi ý.
- Chọn bằng chuột hoặc phím lên/xuống và Enter; Escape đóng gợi ý.
  Enter khi chưa chọn tìm theo toàn bộ nội dung đã nhập.
- Chọn gợi ý áp dụng mã vào bộ lọc kết quả, không tự mở hồ sơ.
- Giữ được bộ lọc năm, ngành, quyết định, trạng thái và khoảng ngày cấp.
  Phân trang, báo cáo và xuất sổ dùng cùng điều kiện tìm kiếm.

Thứ tự ưu tiên: khớp mã, khớp họ tên, tiền tố mã, tiền tố tên, các từ khóa và
tên gần giống. Tên gần giống có nhãn riêng, chỉ áp dụng với chuỗi tên 4-80 ký tự
sau chuẩn hóa, không áp dụng với mã có số/ký tự phân cách. Đây là so khớp trigram,
không phải AI và không bảo đảm sửa đúng mọi lỗi gõ.

**Kết quả tìm kiếm không thay thế xác thực văn bằng.** Tra cứu công khai và
xác thực PDF/QR không thay đổi trong chức năng này.

## Thiết kế và bảo mật

- Dùng PostgreSQL hiện tại, không thêm dịch vụ tìm kiếm, AI hay bảng sao dữ liệu
  nghiệp vụ. Tìm kiếm không đọc/ghi blockchain.
- API kiểm tra lại quyền Admin/cán bộ duyệt và trường từ phiên đăng nhập;
  không nhận trường do người dùng tự chỉ định, không mở gợi ý cho khách/sinh viên.
- Chỉ lấy phiên bản mới nhất đã duyệt có ISSUE COMMITTED, bao gồm đã cấp,
  thu hồi và thay thế. Không lấy nháp, giao dịch chờ hoặc bản cũ khi bản mới
  chưa ghi nhận. Trạng thái được hiển thị riêng.
- Tìm theo snapshot đã phát hành. Chỉ fallback dữ liệu quan hệ khi khóa trong
  snapshot lịch sử bị thiếu; giá trị null rõ ràng không bị thay thế.
- SQL tham số hóa, tìm `%`, `_` và dấu gạch chéo ngược như ký tự thường.
- Gợi ý không hydrate toàn bộ văn bằng, không đếm tổng, không trả ngày sinh,
  GPA, payload hoặc chữ ký. Phản hồi không cache; giới hạn 120 yêu cầu/phút và
  giữ giới hạn ngắn hạn của API.
- Trình duyệt hủy yêu cầu cũ, bỏ phản hồi đến trễ và hủy khi đóng/rời trang.
  Khi gợi ý lỗi, vẫn có thể Enter để tìm bình thường.

Migration `20261105010000_register_search` bổ sung `pg_trgm`, hai hàm SQL,
hai chỉ mục GIN biểu thức và chỉ mục snapshot thiếu trường. Không sửa payload,
hash, PDF hoặc ledger. Tài khoản migration cần quyền cài extension trusted và
tạo chỉ mục; không nâng quyền tài khoản chạy ứng dụng.

Chạy `npm run db:migrate -w api` trước khi dùng API mới, kiểm tra cả các
migration cũ còn chờ. Migration giới hạn chờ khóa 5 giây và thực thi 120 giây.
Kho lớn cần đánh giá xây chỉ mục trên bản sao và lên lịch bảo trì. Không sửa
migration đã áp dụng; thay đổi tiếp theo phải dùng migration mới.

## Các tệp chính

| Tệp                                                            | Nhiệm vụ                                             |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| `apps/api/src/cert/register-search.ts`                         | Chuẩn hóa, ứng viên có chỉ mục, đối sánh và xếp hạng |
| `apps/api/src/cert/diploma-register.ts`                        | Phạm vi trường, snapshot, bộ lọc, danh sách và gợi ý |
| `apps/api/src/cert/cert.service.ts`                            | Quyền, transaction đọc và thứ tự kết quả             |
| `apps/api/src/cert/cert.controller.ts`                         | API `GET /cert/register/suggestions`                 |
| `apps/web/src/app/api/certificates/suggestions/route.ts`       | Proxy phiên đăng nhập, giới hạn và không cache       |
| `apps/web/src/components/RegisterQuickSearch.tsx`              | Ô nhập, debounce và bàn phím                         |
| `apps/web/src/app/(admin)/certificates/CertificatesClient.tsx` | Tích hợp Sổ văn bằng                                 |

## Kiểm thử

Chạy tại thư mục gốc sau khi cấu hình CSDL và cài dependencies:

```powershell
npm run build -w api
npm test -w api -- --runInBand
node scripts/test-register-search.mjs
node scripts/test-diploma-register.mjs
node scripts/test-diploma-register-db.mjs
node scripts/test-register-search-performance.mjs
npm run build -w @diploma-chain/web
```

Kiểm thử CSDL và benchmark tạo fixture trong transaction luôn rollback. Không
phát hành văn bằng thật, tạo PDF hoặc gửi giao dịch Fabric. Benchmark dùng
10.000 văn bằng giả lập, 5 lần mỗi truy vấn, bảng tạm sao chép cấu trúc/chỉ mục
và ANALYZE riêng bảng tạm; không sửa statistics của bảng nghiệp vụ thật.

Kết quả tham khảo tại máy phát triển ngày 05/11/2026:

| Truy vấn                       | Trung vị qua Prisma | Server EXPLAIN ANALYZE |
| ------------------------------ | ------------------: | ---------------------: |
| Gợi ý mã chính xác             |              5,0 ms |                 2,1 ms |
| Gợi ý tên kết hợp mã           |              5,3 ms |                 1,9 ms |
| Gợi ý tên không dấu phổ biến   |            425,9 ms |               445,1 ms |
| Gợi ý tên gõ gần đúng          |            508,0 ms |               513,1 ms |
| Danh sách theo mã, có đếm tổng |              5,4 ms |                 2,1 ms |

Truy vấn mã dùng chỉ mục tìm kiếm. Hai truy vấn tên cố ý khớp gần như toàn bộ
10.000 bản ghi, planner chọn quét thay vì GIN; không ép chỉ mục khi không có lợi.
Truy vấn bắt đầu từ ứng viên, loại bản có phiên bản mới hơn và chuẩn hóa mỗi
trường một lần để tránh đọc mọi văn bằng khi tìm mã.

Đây không phải cam kết production hay kiểm thử tải nhiều người. Chưa tính
debounce 300 ms, HTTP, mạng, render, kho hàng triệu bản ghi hoặc chi phí cập nhật
chỉ mục lúc nhập. Khi mở rộng cần đo p95/p99, slow query, autovacuum/statistics
với dữ liệu thực. Không suy ra tốc độ phát hành blockchain từ kết quả này.

`scripts/test-university-ui-web.mjs` hỗ trợ Chrome qua
`WORKDESK_BROWSER_MODULE`, `WORKDESK_BROWSER_EXECUTABLE`; không cần thêm
Playwright vào dependencies đề tài. Có kiểm tra dropdown tại 320/390/1280 px,
không tràn và chọn bằng bàn phím. Backend/phiên biệt lập; ảnh, profile, build
và liên kết dependency nằm trong thư mục tạm và được dọn trong finally.
