# Phát hành văn bằng theo đợt

## Phạm vi

- Mở **Hồ sơ cấp văn bằng → Phát hành văn bằng** tại `/issue`. Đường dẫn cũ `/diploma-records/batches` tự chuyển đến trang mới.
- Giữ mô hình một cơ sở chính, một cán bộ duyệt. Admin, sinh viên và cán bộ cơ sở cũ không có quyền quản lý đợt.
- Đợt là nhóm nghiệp vụ, khác với đợt nhập Excel và khác với block blockchain. Đợt mới được xác định bằng năm phát hành và số đợt; có thể gồm hồ sơ từ nhiều tệp, quyết định, năm tốt nghiệp và ngành. Đợt cũ vẫn giữ phạm vi quyết định, năm tốt nghiệp và ngành ban đầu.
- Không tự gom dữ liệu cũ, sửa nội dung quyết định, ghi ledger, ký lại hoặc thay đổi PDF đã phát hành khi tạo đợt.

## Sử dụng

1. Nhập/rà soát và lưu hồ sơ tốt nghiệp bằng chức năng hiện có.
2. Chọn **Lập đợt cấp văn bằng**, nhập năm phát hành và số đợt. Hệ thống tự đặt tên và mã; không cho tạo trùng số đợt trong cùng năm và nhà trường. Năm phát hành có thể khác năm tốt nghiệp nhưng phải trùng năm trên ngày cấp của từng văn bằng.
3. Mở đợt, chọn **Thêm hồ sơ**. Danh sách chỉ có bản nháp chưa ký, chưa thuộc đợt khác, không phải văn bằng thay thế và đúng phạm vi đợt. Hồ sơ chưa đủ dữ liệu vẫn được gom để xử lý nhưng chưa được ký.
4. **Kiểm tra lại đợt** đọc toàn bộ hồ sơ trong một snapshot CSDL nhất quán. Bảng ghi cụ thể các lỗi; liên kết sửa dữ liệu nhập mở đúng đợt/dòng nguồn. Có thể bổ sung thông tin in, xem trước PDF bằng chức năng sẵn có.
5. Chọn các hồ sơ đủ điều kiện trên trang hiện tại, xem danh sách xác nhận rồi **Duyệt và ký**. Server kiểm tra lại quyền, liên kết đợt, thời điểm cập nhật, mã kiểm tra nội dung (kể cả thông tin sinh viên/ngành liên quan) và điều kiện ngay dưới khóa bản ghi trước khi dùng luồng ký/phát hành hiện có.
6. Kết quả ghi riêng từng hồ sơ. Hồ sơ thành công được ký và đưa vào hàng đợi blockchain; hồ sơ lỗi có lý do riêng, không hủy kết quả của hồ sơ khác. Nếu mất kết nối, không tự gửi lại; tải lại để đối chiếu trạng thái.
7. Chỉ **Đã phát hành** sau khi anchor ISSUE của phiên bản hiện hành COMMITTED. Chờ blockchain và lỗi blockchain được thống kê riêng; mở Đối chiếu blockchain để xử lý giao dịch.

Các thẻ Sẵn sàng duyệt/Cần bổ sung là nhóm con của hồ sơ chưa duyệt; không cộng các thẻ này với tổng trạng thái. Bộ lọc và phân trang chỉ đổi bảng, không đổi tổng toàn đợt. Văn bằng thu hồi/thay thế vẫn nằm trong đợt để giữ dấu vết.

## Bảo vệ dữ liệu

- Bảng mới `diploma_issuance_batches` lưu mã/tên đợt, trường/cơ sở, năm phát hành, số đợt và người lập. Đợt cũ giữ quyết định, năm tốt nghiệp và ngành đã ghi nhận; không suy diễn năm phát hành. Cột `diplomas.issuance_batch_id` liên kết hồ sơ; không tham gia payload/hash văn bằng.
- Số đợt duy nhất theo nhà trường và năm phát hành; mã và tên đợt mới được hệ thống sinh tự động. Một đợt tối đa 5.000 hồ sơ; mỗi thao tác thêm/gỡ/duyệt tối đa 100, giao diện chọn tối đa 20 bản ghi của trang hiện tại mỗi lượt.
- Không có xóa đợt hay đổi metadata sau khi lập. Chỉ gỡ bản nháp chưa có phiên bản/chữ ký; gỡ liên kết không xóa hồ sơ. Hồ sơ đang chờ duyệt, đã duyệt hay đã ký không được chuyển đợt.
- Hồ sơ bị từ chối tiếp tục đi qua luồng bổ sung/trình duyệt lại hiện có. Muốn đổi năm/ngành không phù hợp đợt, cần mở lại thành nháp và gỡ khỏi đợt trước.
- FK/trigger kiểm tra trường/cơ sở và khóa liên kết hồ sơ đã trình/ký; đợt cũ tiếp tục kiểm tra quyết định, năm tốt nghiệp và ngành. Quyết định đã được tham chiếu bởi đợt không được đổi số/ngày/năm/trường. Thay đổi thành viên có khóa bản ghi và audit trong cùng transaction; chọn lẫn hồ sơ không hợp lệ sẽ rollback cả thao tác thêm/gỡ.
- Nhật ký có Lập đợt/Thêm hồ sơ/Gỡ hồ sơ; duyệt/ký tiếp tục dùng audit của luồng hiện có. Kiểm tra/tra cứu đợt không ký, không ghi blockchain, không tạo tệp.

## API / Postman

Base local: `http://localhost:3001/api`. Tất cả request yêu cầu Bearer token cán bộ cơ sở chính có quyền duyệt.

| Method | Đường dẫn                                                      | Nội dung                                                                            |
| ------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| GET    | /cert/issuance-batches?page=1&limit=20&issuanceYear=2026       | Danh sách đợt và tiến độ                                                            |
| GET    | /cert/issuance-batches/options?search=123                      | Quyết định/ngành được phép; tối đa 100 quyết định mỗi lần, dùng tìm kiếm để thu hẹp |
| POST   | /cert/issuance-batches                                         | Lập đợt                                                                             |
| GET    | /cert/issuance-batches/:id?page=1&limit=20&status=NEEDS_REVIEW | Kiểm tra toàn đợt, lọc bảng hồ sơ                                                   |
| GET    | /cert/issuance-batches/:id/candidates?page=1&limit=20          | Bản nháp chưa phân đợt phù hợp                                                      |
| POST   | /cert/issuance-batches/:id/members                             | Thêm hồ sơ                                                                          |
| POST   | /cert/issuance-batches/:id/members/remove                      | Gỡ bản nháp                                                                         |
| POST   | /cert/issuance-batches/:id/publish                             | Duyệt/ký hồ sơ đã chọn, kết quả riêng từng UUID                                     |

Body lập đợt:

```json
{ "issuanceYear": 2026, "batchNumber": 1 }
```

Thêm/gỡ: `{ "diplomaIds": ["<UUID hồ sơ>"] }`. Duyệt/ký dùng timestamp của lần GET kiểm tra mới nhất:

```json
{
  "entries": [
    {
      "uuid": "<UUID hồ sơ>",
      "expectedUpdatedAt": "<updatedAt nguyên bản từ GET>",
      "expectedReviewToken": "<reviewToken nguyên bản từ GET>"
    }
  ]
}
```

Các bộ lọc trạng thái: DRAFT, PENDING, REJECTED, ANCHOR_PENDING, ANCHOR_FAILED, ON_CHAIN, REVOKED, REPLACED; READY và NEEDS_REVIEW là bộ lọc điều kiện.

## Triển khai và kiểm thử

1. Sao lưu CSDL trước migration theo quy trình vận hành.
2. Chạy `npm run db:migrate -w api` với connection migrator. Migration `20261118120000_issuance_year_batches` thêm năm phát hành, số đợt và điều chỉnh ràng buộc; không cập nhật hồ sơ cũ hoặc gọi Fabric.
3. Build lại API/web và khởi động lại dịch vụ để nhận route mới. Chưa migrate thì không sử dụng trang đợt.
4. Chạy unit test `npm test -w api -- --runInBand issuance-batch.spec.ts`.
5. Kiểm thử database bằng `node scripts/test-issuance-batches-db.mjs`. Script bắt buộc `ISSUANCE_TEST_DATABASE_URL` trỏ tới database local riêng có tên `diplomachain_issuance_test`, đã migrate. Fixtures nằm trong transaction rollback; signer giả lập, không tạo PDF hay giao dịch Fabric thật. Không dùng database nghiệp vụ.
6. Kiểm thử proxy/UI bằng `node scripts/test-issuance-batches-web.mjs` sau build web. Backend chỉ có dữ liệu giả lập trong bộ nhớ. Có thể bật kiểm thử trình duyệt bằng `ISSUANCE_BROWSER_MODULE` (module Playwright đã cài) và `ISSUANCE_BROWSER_EXECUTABLE` (đường dẫn Chrome/Chromium). Profile và screenshot tạm chỉ đặt trong thư mục tạm và phải được dọn sau kiểm thử.

Các hồ sơ đã trình duyệt theo luồng cũ hoặc hồ sơ thay thế vẫn xử lý tại mục chờ xử lý tương ứng; không tự chuyển hay sửa dữ liệu lịch sử.

## Hai việc đề xuất tiếp theo

1. Trung tâm thông báo công việc: hồ sơ cần bổ sung, giao dịch chờ/lỗi/hết lượt thử, chứng thư sắp hết hạn; nhấn mở đúng công việc. Chưa triển khai trong thay đổi này.
2. Tiếp nhận yêu cầu sửa thông tin từ sinh viên: sinh viên chỉ đề nghị sửa văn bằng của mình, cán bộ xử lý bằng luồng sửa sai/thay thế hiện có; không tự sửa bản đã ký. Chưa triển khai trong thay đổi này.
