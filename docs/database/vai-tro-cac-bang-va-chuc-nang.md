# Tác dụng các bảng trong CSDL DiplomaChain

Đối chiếu ngày **29/10/2026** với `apps/api/prisma/schema.prisma` và các service hiện hành.
Hệ thống dùng **PostgreSQL cho nghiệp vụ**, kho tệp cho Excel/PDF và **Hyperledger Fabric cho bằng chứng blockchain**.
Có **27 bảng ứng dụng** trong Prisma; `_prisma_migrations` là bảng quản lý migration của Prisma, không phải bảng nghiệp vụ thứ 28.
Mô hình hiện tại: **một cơ sở chính TP.HCM, một cán bộ có quyền duyệt và phát hành**; không chuyển hồ sơ sang Hà Nội.

## 1. Danh mục nhà trường: 5 bảng

| Bảng               | Tác dụng trong đề tài                                                                                                                 | Trường, quan hệ cần nhớ                                                       | Chức năng sử dụng                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `institutions`     | Hồ sơ đơn vị/trường quản lý văn bằng; xác định phạm vi dữ liệu của trường.                                                            | `id, code, name`; bảng gốc cho cơ sở, ngành, sinh viên, văn bằng.             | Phân quyền theo trường, thông tin nhà trường trên PDF. |
| `campuses`         | Cơ sở quản lý và phát hành. Giữ cấu trúc để bảo toàn dữ liệu lịch sử dù hiện tại chỉ dùng một cơ sở chính.                            | `institution_id, code, active, is_headquarters, fabric_msp_id`.               | Phạm vi hồ sơ và danh tính phát hành Fabric.           |
| `programs`         | Danh mục ngành được phê duyệt; lưu tên Việt/Anh và mã ngành chuẩn.                                                                    | `institution_id, code, name, name_en, national_code, active`.                 | Menu Danh mục, kiểm tra dữ liệu, nội dung văn bằng.    |
| `program_aliases`  | Ánh xạ tên ngành trong Excel/tên viết tắt về ngành chuẩn. Đây là bảng xử lý lỗi “Ngành chưa được ánh xạ vào danh mục được phê duyệt”. | `program_id, institution_id, normalized_name, original_name, approved_by_id`. | Duyệt tên tương đương, nhập Excel và lập hồ sơ.        |
| `academic_classes` | Danh mục lớp theo cơ sở; không đồng nhất lớp với sinh viên.                                                                           | `campus_id, code, cohort_code`; được tham chiếu bởi `enrollments`.            | Lưu quá trình học, tra cứu lớp trong hồ sơ.            |

## 2. Sinh viên và tốt nghiệp: 4 bảng

| Bảng                   | Tác dụng trong đề tài                                                                                                        | Trường, quan hệ cần nhớ                                                                   | Chức năng sử dụng                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `students`             | Thông tin cá nhân sinh viên, MSSV, ngày sinh, thông tin liên hệ. Không phải tài khoản đăng nhập và cũng không phải văn bằng. | `institution_id, student_code, full_name, date_of_birth`; MSSV duy nhất trong một trường. | Quản lý sinh viên, tra cứu danh tính người được cấp bằng.                                        |
| `enrollments`          | Quá trình sinh viên học ngành/lớp nào, tại cơ sở nào, khóa học nào.                                                          | `student_id, program_id, campus_id, class_id, start_year, end_year`.                      | Liên kết sinh viên với lớp/ngành; một người có thể có nhiều quá trình học.                       |
| `graduation_decisions` | Quyết định công nhận tốt nghiệp, số quyết định, ngày ký và người ký quyết định.                                              | `document_number, decision_year, signed_on, signer_name, source_document_id`.             | Chứng cứ nguồn cho kết quả tốt nghiệp. Người ký quyết định không mặc nhiên là người ký văn bằng. |
| `graduation_records`   | Kết quả tốt nghiệp theo sinh viên/ngành/năm: GPA, thang điểm, xếp loại, loại bằng. Có thể tồn tại khi chưa cấp văn bằng.     | `student_id, program_id, enrollment_id, decision_id, source_row_id, graduation_year`.     | Kiểm tra điều kiện, tạo hồ sơ cấp bằng, liên kết quyết định và dòng Excel nguồn.                 |

## 3. Văn bằng, PDF và blockchain: 7 bảng

| Bảng                       | Tác dụng trong đề tài                                                                                                                             | Trường, quan hệ cần nhớ                                                                                                 | Chức năng sử dụng                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `diplomas`                 | Hồ sơ văn bằng và trạng thái hiện tại: nháp, chờ xử lý, đã duyệt, thu hồi, thay thế. Lưu số hiệu/số vào sổ/ngày cấp, thông tin in và người duyệt. | `graduation_id, certificate_no, registry_no, status, workflow_status, approved_by_id, supersedes_id, replacement_data`. | Hồ sơ cấp văn bằng, sổ văn bằng, từ chối/bổ sung, sửa sai/thay thế, thu hồi. |
| `diploma_versions`         | Snapshot dữ liệu đã được phê duyệt theo phiên bản, cùng hash SHA-256 dùng đối chiếu blockchain. Không sửa snapshot cũ để “sửa bằng”.              | `diploma_id, version, schema_version, payload, payload_hash`.                                                           | Phát hành, xác thực và truy nguyên phiên bản.                                |
| `signed_diploma_documents` | Metadata tệp PDF gốc và PDF đã ký: khóa lưu trữ, hash, kích thước, thời điểm hoàn tất, kiểu ký. Không chứa toàn bộ byte PDF.                      | `diploma_id, version_id, signing_mode, origin_pdf_key, signed_pdf_key, signed_pdf_hash`.                                | Xem/tải PDF, xác thực đúng tệp đã ký.                                        |
| `diploma_pdf_signatures`   | Bằng chứng của từng chữ ký số: người ký, chứng thư, thời hạn, thời điểm ký và dữ liệu kiểm tra CA/TSA/OCSP/CRL nếu có.                            | `document_id, actor_id, campus_id, signature_order, certificate_sha256, validation_evidence`.                           | PDF mới một chữ ký theo luồng một cán bộ; vẫn giữ chữ ký của hồ sơ lịch sử.  |
| `diploma_events`           | Lịch sử nghiệp vụ của từng văn bằng, ví dụ lập, duyệt, từ chối, mở lại, thu hồi, đề nghị thay thế, thử lại giao dịch.                             | `diploma_id, event_type, actor_id, reason, metadata, created_at`.                                                       | Tab lịch sử và truy vết xử lý hồ sơ.                                         |
| `blockchain_anchors`       | Chỉ mục cục bộ của lần neo dữ liệu lên Fabric: trạng thái, hash, mã giao dịch, số khối và lỗi gần nhất. **Không phải sổ cái blockchain**.         | `version_id, event_type, status, transaction_id, block_number, payload_hash`.                                           | Đối chiếu blockchain, hiển thị chờ/đã ghi/thất bại.                          |
| `outbox_events`            | Hàng đợi tin cậy chuyển sự kiện ISSUE/REVOKE từ transaction PostgreSQL sang Fabric; lưu lượt thử, lịch chạy, khóa xử lý và lỗi.                   | `version_id, event_type, payload, status, attempts, available_at, locked_until, lock_token`.                            | Đồng bộ blockchain bất đồng bộ và xử lý giao dịch hết lượt thử.              |

## 4. Nhập Excel và kiểm tra dữ liệu: 4 bảng

| Bảng                | Tác dụng trong đề tài                                                                                    | Trường, quan hệ cần nhớ                                                                   | Chức năng sử dụng                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_documents`  | Đăng ký tệp nguồn được giữ trong kho: tên, hash SHA-256, dung lượng, đường dẫn lưu trữ và người tải lên. | `institution_id, file_name, sha256, byte_size, storage_key`.                              | Truy nguyên Excel/quyết định gốc, nhận diện file đã nhập.                                                                                     |
| `import_batches`    | Một đợt staging/kiểm tra/nhập dữ liệu từ tài liệu nguồn, theo cơ sở và phiên bản ánh xạ.                 | `document_id, campus_id, mapping_version, status, total_rows, imported_rows`.             | Danh sách đợt nhập, tổng hợp dòng hợp lệ/cần kiểm tra/đã nhập.                                                                                |
| `import_rows`       | Mỗi dòng Excel theo sheet/số dòng; giữ dữ liệu gốc, dữ liệu chuẩn hóa và phần sửa có đối soát.           | `batch_id, sheet_name, row_number, raw_data, normalized_data, overrides, reviewed_by_id`. | So sánh trùng, sửa có lý do, nhập dòng READY. Không ghi đè dữ liệu gốc để che lỗi.                                                            |
| `validation_issues` | Lỗi/cảnh báo gắn với dòng và trường cụ thể: thiếu thông tin, trùng dữ liệu, ngành chưa ánh xạ...         | `row_id, field, code, severity, message, resolved_at`.                                    | Tab kiểm tra dữ liệu và chỉ ra lỗi ở đâu. Chi tiết bản ghi trùng được API tính từ dữ liệu nguồn/đã lưu, không có một bảng “duplicates” riêng. |

## 5. Tài khoản và an toàn hệ thống: 6 bảng

| Bảng                  | Tác dụng trong đề tài                                                                                   | Trường, quan hệ cần nhớ                                                            | Chức năng sử dụng                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `accounts`            | Tài khoản đăng nhập và mật khẩu đã hash; có thể liên kết sinh viên.                                     | `email, password_hash, student_id, active, must_change_password, session_version`. | Đăng nhập, đổi mật khẩu, khóa tài khoản, vô hiệu hóa phiên. Không giải mã hash để lấy mật khẩu. |
| `account_memberships` | Gán vai trò và quyền cho tài khoản tại cơ sở. Quyền duyệt là capability riêng, không suy từ role admin. | `account_id, campus_id, role, active, can_approve_diplomas`.                       | RBAC và giới hạn đúng cơ sở/trường; UNIVERSITY tại cơ sở chính phải có quyền duyệt.             |
| `refresh_sessions`    | Phiên refresh token: chỉ lưu hash token, thời hạn, chuỗi thay thế và dấu thu hồi.                       | `account_id, membership_id, family_id, token_hash, replaced_by_id, revoked_at`.    | Gia hạn đăng nhập, logout, phát hiện dùng lại refresh token đã xoay vòng.                       |
| `otp_challenges`      | OTP kích hoạt tài khoản sinh viên, lưu hash chứ không lưu OTP rõ.                                       | `account_id, code_hash, expires_at, consumed_at, attempts`.                        | Gửi OTP, kiểm tra OTP khi đăng ký/kích hoạt.                                                    |
| `audit_logs`          | Nhật ký hoạt động toàn hệ thống: ai làm gì, đối tượng, kết quả, IP và metadata.                         | `institution_id, actor_id, actor_email, action, target, result, metadata`.         | Menu Nhật ký hoạt động; khác với `diploma_events` chỉ theo một văn bằng.                        |
| `integrity_alerts`    | Cảnh báo phát hiện chênh lệch dữ liệu/hash giữa PostgreSQL và Fabric; lưu người và ghi chú xử lý.       | `diploma_id, type, database_hash, fabric_hash, resolved_at, resolved_by_id`.       | Kiểm tra toàn vẹn, xử lý cảnh báo. Đánh dấu đã xử lý không tự sửa blockchain.                   |

## 6. Chuyển đổi dữ liệu cũ: 1 bảng

| Bảng             | Tác dụng trong đề tài                                                                                                | Trường, quan hệ cần nhớ                                                                           | Chức năng sử dụng                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `legacy_id_maps` | Ánh xạ ID của hệ thống/nguồn cũ sang UUID hiện tại để chuyển đổi dữ liệu có thể chạy lại mà không tạo bản ghi trùng. | `source, entity, legacy_id, target_id`; `target_id` không phải một FK đa hình do Prisma khai báo. | Migration/cutover dữ liệu, không phải bảng người dùng nhập hằng ngày. |

## 7. Quan hệ cần nắm khi thuyết trình

```text
institutions -> campuses -> account_memberships <- accounts
institutions -> programs <- program_aliases
students -> enrollments -> graduation_records <- graduation_decisions
graduation_records -> diplomas -> diploma_versions
                               -> signed_diploma_documents -> diploma_pdf_signatures
                               -> diploma_events
diploma_versions -> blockchain_anchors
                 -> outbox_events
source_documents -> import_batches -> import_rows -> validation_issues
import_rows -> graduation_records
diplomas -> integrity_alerts
accounts -> refresh_sessions / otp_challenges / audit_logs
```

- `students.id` là UUID nội bộ; MSSV nằm ở `student_code`. Tương tự, UUID văn bằng không phải số hiệu hay số vào sổ.
- Một hồ sơ tốt nghiệp có thể chưa có văn bằng. Khi thay thế, văn bằng mới liên kết văn bằng gốc qua `supersedes_id`, không xóa văn bằng gốc.
- Cán bộ duyệt tạo phiên bản, PDF ký và outbox trong transaction DB. Worker gửi Fabric; chỉ khi commit thành công mới có anchor `COMMITTED`.
- Fabric lưu hash/định danh phiên bản/sự kiện, không lưu toàn bộ hồ sơ cá nhân hoặc byte PDF. Xóa hàng PostgreSQL không xóa giao dịch đã nằm trên blockchain.
- Code campus `ORG2` còn được giữ tương thích; danh tính phát hành kỹ thuật hiện tại là `Org1MSP`. Đây không phải hai người duyệt hoặc hai cơ sở nghiệp vụ.
- Các schema trong `apps/api/src/mongo/schemas` là mã tương thích cũ; `AppModule` hiện tại không nạp Mongo module làm CSDL nghiệp vụ.

## 8. Trạng thái không được nhầm

| Vị trí                      | Trạng thái chính                          | Ý nghĩa                                                                                  |
| --------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `diplomas.workflow_status`  | DRAFT / REQUESTED / APPROVED / REJECTED   | Tiến độ xử lý hồ sơ. REQUESTED hiện là chờ cán bộ tại cùng cơ sở, không phải gửi Hà Nội. |
| `diplomas.status`           | DRAFT / ACTIVE / REVOKED / SUPERSEDED     | Tình trạng văn bằng trong DB. ACTIVE chưa tự chứng minh blockchain đã commit.            |
| `blockchain_anchors.status` | QUEUED / SUBMITTED / COMMITTED / FAILED   | Kết quả neo dữ liệu lên Fabric.                                                          |
| `outbox_events.status`      | PENDING / PROCESSING / COMPLETED / FAILED | Tiến trình gửi sự kiện; FAILED có thể còn hoặc đã hết lượt thử.                          |
| API/sổ văn bằng             | ANCHOR_PENDING / ON_CHAIN / REPLACED...   | Trạng thái tổng hợp để hiển thị; không phải toàn bộ đều là enum của bảng diplomas.       |
| Bộ lọc explorer             | EXHAUSTED                                 | Trạng thái tính từ outbox FAILED với ít nhất 10 lượt thử; không phải enum AnchorStatus.  |

## 9. Bảng nào nên xóa để test?

**Không có bảng nào là “file rác”.** Không TRUNCATE/CASCADE trực tiếp để làm sạch test trên CSDL đang dùng.
Giữ danh mục, tài khoản/quyền, nguồn Excel, phiên bản bất biến, PDF/chữ ký, audit, outbox và bằng chứng ledger.
Để chạy lại từ đầu, dùng **DB và mạng Fabric thử nghiệm tách biệt**, có sao lưu và xác nhận phạm vi; bộ Postman không có API xóa toàn bộ dữ liệu/ledger.
Văn bằng đã phát hành phải xử lý bằng thu hồi hoặc thay thế, không xóa dấu vết.

## 10. Tài liệu đi kèm

- [Link API, quyền và mẫu nhập Postman](./api-test-samples.md).
- [Collection Postman có mẫu sẵn](./api-test-samples.postman_collection.json).
- [Từ điển cột chi tiết](./data-dictionary.md) và [luồng một cơ sở](./single-campus-workflow.md).

Nguồn đối chiếu: `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.ts`,
`apps/api/src/database/diploma-projection.ts`, các service trong `cert`, `imports`,
`signatures`, `outbox`, `explorer`, `auth` và `integrity`.
