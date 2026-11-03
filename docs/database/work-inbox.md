# Thông báo công việc

## Cách dùng

Chuông **Thông báo công việc** xuất hiện ở thanh đầu trang của cán bộ, admin
và thanh điều hướng sinh viên. Không tạo thêm menu cấp cao, giữ khung nghiệp vụ
đã thống nhất.

- **Cán bộ**: hồ sơ chờ duyệt, hồ sơ bị từ chối, hồ sơ thay thế chờ duyệt hoặc
  bị từ chối, yêu cầu chỉnh sửa cần tiếp nhận / đang xử lý và lỗi blockchain.
- **Admin**: chỉ các vấn đề đồng bộ blockchain, không có thông báo duyệt nghiệp vụ.
- **Sinh viên**: phản hồi cho yêu cầu chỉnh sửa của chính mình, gồm đang xử lý,
  cần bổ sung và kết quả chấp nhận / không chấp nhận. Kết quả đã đóng hiển thị
  trong 30 ngày; lịch sử đầy đủ vẫn ở màn hình yêu cầu.

Thông báo nhóm công việc cùng loại; số trên chuông là **số nhóm chưa đọc**, không
phải số hồ sơ. Mỗi nhóm hiển thị số hồ sơ / yêu cầu / giao dịch thực tế.

**Xem công việc** đánh dấu nhóm đã đọc rồi mở đúng màn hình. Thông báo hồ sơ
thay thế mở thẳng tab thay thế, thông báo bổ sung của sinh viên mở đúng bộ lọc.
Cũng có thể **Đánh dấu đã đọc** mà không rời trang.

## Không bỏ sót công việc mới

- Đọc trạng thái nghiệp vụ hiện có, không nhân bản hàng loạt thông báo.
- Tự cập nhật mỗi 60 giây khi trang đang hiển thị, khi cửa sổ lấy lại focus,
  khi mở chuông hoặc bấm **Cập nhật**. Đây không phải WebSocket/push tức thời.
- Một nhóm được đánh dấu bằng fingerprint của tập ID và phiên bản công việc.
  Nếu có hồ sơ mới, đổi trạng thái hoặc phản hồi mới, nhóm trở lại **Chưa đọc**,
  kể cả khi tổng số công việc không thay đổi.
- Công việc đã xử lý không còn thuộc nhóm đang mở. Đánh dấu đã đọc không duyệt,
  thu hồi, sửa hồ sơ hoặc xóa giao dịch.
- Giao dịch bị lỗi/hết lượt thử lại được tính một lần dù cả anchor và outbox
  đều ghi lỗi. Giao dịch chờ quá 15 phút có nhóm nhắc kiểm tra riêng.
- Nếu mất kết nối, hiển thị cảnh báo và giữ kết quả lần tải trước, không giả báo
  rằng hệ thống không còn công việc.

## Dữ liệu và phân quyền

`inbox_receipts` chỉ lưu `membership_id`, khóa nhóm, fingerprint và thời điểm đọc.
Trạng thái đã đọc độc lập theo vai trò/phạm vi đăng nhập; không lưu nội dung
văn bằng, số định danh, hash tệp PDF hoặc thông tin bí mật vào thông báo.
Các bảng hồ sơ, yêu cầu chỉnh sửa, anchor và outbox là nguồn nghiệp vụ.

API dùng actor đã được JWT guard kiểm tra lại tài khoản/membership trong DB.
Cán bộ giới hạn trường/cơ sở; admin giới hạn trường; sinh viên cần đúng cả
người gửi và chủ sở hữu văn bằng. Không cho client chỉ định người nhận.

## API / Postman

Base: `http://localhost:3001/api`, Bearer token theo tài khoản cần kiểm tra.

| Method | Endpoint    | Mục đích                                         |
| ------ | ----------- | ------------------------------------------------ |
| GET    | /inbox      | Nhóm công việc, số nhóm chưa đọc, tổng công việc |
| POST   | /inbox/read | Đánh dấu đúng phiên bản nhóm đã đọc              |

Lấy `key` và `fingerprint` từ `items` của GET, không tự tạo fingerprint:

```json
{
  "key": "requests",
  "fingerprint": "<64 ký tự hex lấy từ GET /inbox>"
}
```

HTTP 409 nghĩa là nhóm đã thay đổi; tải lại trước khi đánh dấu. API không có
thao tác xóa công việc hoặc xem thông báo của tài khoản khác.

## Triển khai và kiểm thử

Khi PostgreSQL đã chạy, dùng cấu hình migrator để chạy
`npm run db:migrate -w api`, sau đó build/restart API và web.
Migration chỉ thêm bảng receipt, không thay đổi dữ liệu văn bằng đã lưu.

- `npm test -w api -- --runInBand inbox.spec`.
- `WORKDESK_TEST_DATABASE_URL` phải trỏ đến DB tạm loopback tên
  `diplomachain_workdesk_test` đã migrate. Chạy `node scripts/test-inbox-db.mjs`;
  fixtures rollback, không giao dịch Fabric thật.
  DB kiểm thử cần khởi tạo quyền như `infra/postgres/init-users.sh` và migrate
  bằng `diplomachain_migrator`. Tài khoản chạy fixture cần quyền
  `SET ROLE diplomachain_app` để kiểm tra đúng quyền API thực tế; không dùng DB nghiệp vụ.
- Build web rồi chạy `node scripts/test-inbox-web.mjs` để kiểm tra proxy bằng
  backend giả lập. Đặt `WORKDESK_BROWSER_MODULE` trỏ đến Playwright Core và
  `WORKDESK_BROWSER_EXECUTABLE` trỏ đến Chrome để chạy thêm tương tác trình duyệt,
  luồng đã đọc/chưa đọc, liên kết bộ lọc, lỗi kết nối và màn hình nhỏ.
- Hồi quy tính năng liên quan: `scripts/test-change-requests-db.mjs` và
  `scripts/test-change-requests-web.mjs`.
