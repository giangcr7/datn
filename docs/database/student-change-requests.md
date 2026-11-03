# Yêu cầu chỉnh sửa thông tin văn bằng

## Phạm vi

- Sinh viên: **Yêu cầu chỉnh sửa**, hoặc nút cùng tên tại **Văn bằng của tôi**.
- Cán bộ: **Hồ sơ cấp văn bằng → Yêu cầu chỉnh sửa**.
- Chỉ tiếp nhận văn bằng đã phát hành, blockchain xác nhận và chưa bị thu hồi.
- Sinh viên chỉ xem và gửi yêu cầu cho văn bằng của chính tài khoản đã liên kết.
- Admin kỹ thuật không tiếp nhận hay duyệt nghiệp vụ này.

Các trường đề nghị: họ tên, ngày sinh, ngành, xếp loại. Hệ thống ghi lại
thông tin **trong phiên bản đã cấp**, thông tin đề nghị và căn cứ đối chiếu.
Đây không phải chức năng sửa trực tiếp bảng sinh viên hoặc PDF đã ký.
Không nhận tệp đính kèm; căn cứ văn bản được ghi vào nội dung yêu cầu.

## Luồng xử lý

1. Sinh viên gửi yêu cầu: **Chờ tiếp nhận**. Một văn bằng chỉ có một yêu cầu đang mở.
2. Cán bộ **Tiếp nhận xử lý**, kiểm tra hồ sơ gốc.
3. Nếu thiếu căn cứ: **Yêu cầu bổ sung**. Sinh viên gửi thông tin bổ sung để trình lại.
4. Nếu không có căn cứ chỉnh sửa: **Không chấp nhận**, bắt buộc ghi lý do.
5. Nếu cần sửa: lập hồ sơ tại **Sổ văn bằng → thay thế**, xử lý ở
   **Hồ sơ chờ xử lý → Sửa sai và thay thế**, theo luồng đã có.
6. Chỉ **Hoàn tất bằng văn bằng thay thế** khi văn bằng mới phát hành thành công
   và giao dịch thu hồi bản cũ đều được blockchain xác nhận.

Sinh viên có thể rút khi chờ tiếp nhận hoặc cần bổ sung, không thể tự đóng một
yêu cầu đang được cán bộ xử lý. Yêu cầu đã đóng không mở lại; có thể gửi mới
cho văn bằng còn hiệu lực. Mỗi thao tác kiểm tra revision để tránh ghi đè
khi nhiều cửa sổ đang mở. Lịch sử phản hồi giữ nguyên, không sửa hoặc xóa.

## Bảng dữ liệu

- `diploma_change_requests`: văn bằng, người gửi, nội dung gốc bất biến,
  trạng thái, revision, văn bằng thay thế khi hoàn tất.
- `diploma_change_request_events`: lịch sử phản hồi theo revision, chỉ thêm.
- `audit_logs`: hành động `DIPLOMA_CHANGE_REQUEST`, không sao chép dữ liệu
  đề nghị chi tiết vào nhật ký chung.

## API / Postman

Base: `http://localhost:3001/api`. Dùng Bearer token thật theo vai trò.

| Method | Endpoint                                        | Mục đích                                     |
| ------ | ----------------------------------------------- | -------------------------------------------- |
| GET    | /change-requests/eligible                       | Văn bằng của sinh viên được phép gửi yêu cầu |
| GET    | /change-requests?page=1&limit=20&status=PENDING | Danh sách đúng phạm vi người đăng nhập       |
| POST   | /change-requests                                | Sinh viên gửi yêu cầu                        |
| POST   | /change-requests/:id/action                     | Chuyển trạng thái / phản hồi                 |

Gửi mới, thay UUID bằng văn bằng từ API eligible:

```json
{
  "diplomaId": "00000000-0000-4000-8000-000000000001",
  "changes": [{ "field": "fullName", "value": "Nguyễn Văn An" }],
  "reason": "Đề nghị đối chiếu họ tên với giấy khai sinh và hồ sơ gốc."
}
```

Cán bộ tiếp nhận, dùng revision mới nhất trả về từ danh sách:

```json
{
  "status": "IN_REVIEW",
  "expectedRevision": 1,
  "note": "Đã tiếp nhận, đang đối chiếu hồ sơ gốc."
}
```

Các trạng thái tiếp theo: `NEEDS_INFORMATION`, `REJECTED`; sinh viên bổ sung
dùng `PENDING` hoặc rút bằng `CANCELLED`. Khi `RESOLVED`, bổ sung
`resolvedDiplomaId` là UUID văn bằng thay thế đúng nguồn, không phải UUID bất kỳ.

## Triển khai và kiểm thử

Chạy `npm run db:migrate -w api` bằng cấu hình migrator khi PostgreSQL đã chạy,
sau đó build/restart API và web. Migration chỉ thêm bảng, không xóa dữ liệu cũ.

- `npm test -w api -- --runInBand change-request-state.spec`
- Build API, đặt `WORKDESK_TEST_DATABASE_URL` trỏ tới PostgreSQL tạm trên loopback,
  database bắt buộc tên `diplomachain_workdesk_test`, đã migrate đầy đủ.
- `node scripts/test-change-requests-db.mjs`: quyền sở hữu, phân quyền,
  trạng thái, sửa đồng thời, liên kết thay thế, ràng buộc DB và HTTP validation.
  Toàn bộ fixture nằm trong transaction rollback, không ghi blockchain thật.
