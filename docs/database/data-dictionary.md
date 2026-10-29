# Từ điển dữ liệu

Xem [tác dụng và quan hệ đầy đủ của 27 bảng](./vai-tro-cac-bang-va-chuc-nang.md)
và [API/mẫu nhập Postman](./api-test-samples.md) cho luồng hiện tại một cơ sở chính TP.HCM.
Phần Physical schema là ảnh chụp tại lần sinh tài liệu; đối chiếu `apps/api/prisma/schema.prisma` khi cần danh sách cột mới nhất.

## Phân loại trường

- **CORE**: bắt buộc để xác định hồ sơ và cấp văn bằng.
- **CONTROL**: dùng để ràng buộc phạm vi, workflow, audit, blockchain hoặc chống sửa.
- **OPTIONAL**: hữu ích cho tra cứu nhưng không được dùng một mình để định danh.
- **STAGING**: giữ nguyên nguồn và dữ liệu chuẩn hóa trước khi commit.
- **LEGACY**: giữ tương thích với hệ thống/chaincode cũ, không dùng làm thiết kế mới.

## Bảng nghiệp vụ

| Bảng                 | Trường quan trọng                                                                         | Trường ít thiết yếu/optional                               | Ghi chú                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| institutions         | id, code, name                                                                            | created_at                                                 | Một trường có thể có nhiều cơ sở                                                                           |
| campuses             | id, institution_id, code, active, is_headquarters                                         | name, fabric_msp_id                                        | Hiện dùng một cơ sở chính TP.HCM; MSP là danh tính phát hành kỹ thuật                                      |
| programs             | id, institution_id, code, name                                                            | national_code, active                                      | Tên Excel không dùng trực tiếp làm khóa                                                                    |
| program_aliases      | normalized_name, program_id, approved_by_id                                               | original_name                                              | Bắt buộc duyệt alias typo/viết hoa                                                                         |
| academic_classes     | campus_id, code                                                                           | cohort_code                                                | Lớp là thuộc tính enrollment, không đặt trong Student                                                      |
| students             | institution_id, student_code, full_name                                                   | DOB, nơi sinh, giới tính, dân tộc, quốc tịch, email, phone | MSSV unique theo trường; không phải primary key                                                            |
| enrollments          | student_id, program_id, campus_id                                                         | class_id, start/end year, cohort                           | Cho phép sinh viên có nhiều quá trình học                                                                  |
| graduation_decisions | document_number, decision_year                                                            | signed_on, signer_name, source_document_id                 | Quyết định tái sử dụng cho nhiều graduation record                                                         |
| graduation_records   | student_id, program_id, graduation_year                                                   | GPA, classification, degree_type, specialization           | Có thể tồn tại dù chưa có Diploma                                                                          |
| diplomas             | graduation_id, campus_id, issuing_campus_id, certificate_no, registry_no, workflow/status | issued_on, replacement/revocation fields                   | campus_id giữ cơ sở nguồn; issuing_campus_id là trụ sở phát hành sau duyệt; cặp số unique theo institution |
| diploma_versions     | diploma_id, version, schema_version, payload, payload_hash                                | created_by_id                                              | Snapshot bất biến để xác thực                                                                              |
| diploma_events       | diploma_id, event_type, actor_id                                                          | reason, metadata                                           | Append-only event history                                                                                  |
| blockchain_anchors   | version_id, event_type, status, payload_hash                                              | tx/block/MSP/error                                         | Chỉ là index kết quả anchor, không thay thế chain                                                          |
| outbox_events        | version_id, event_type, payload, status                                                   | attempts/lease/error                                       | Bảo đảm transaction DB không gọi chain trực tiếp                                                           |

## Bảng nhập liệu

| Bảng              | Trường                                                               | Ý nghĩa                                   |
| ----------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| source_documents  | sha256, storage_key, byte_size                                       | File gốc và checksum; không update/delete |
| import_batches    | document_id, campus_id, mapping_version, status                      | Một lần parse/review/commit               |
| import_rows       | sheet_name, row_number, raw_data, normalized_data, overrides, status | Raw immutable; correction qua overrides   |
| validation_issues | field, code, severity, message, resolved_at                          | Có thể có nhiều issue trên một dòng       |

## Bảng bảo mật/audit

| Bảng                | Trường quan trọng                                         | Quy tắc                                                                   |
| ------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| accounts            | email, password_hash, active, session_version             | Không lưu mật khẩu plaintext; email lowercase                             |
| account_memberships | account_id, campus_id, role, active, can_approve_diplomas | Chỉ university tại trụ sở có capability mới duyệt; admin không duyệt thay |
| refresh_sessions    | token_hash, family_id, expires_at, revoked_at             | Rotation và reuse detection                                               |
| otp_challenges      | account_id, code_hash, expires_at, attempts               | Hash OTP; tối đa 5 lần                                                    |
| audit_logs          | actor, action, result, target, metadata                   | Append-only, không log secret/OTP                                         |
| integrity_alerts    | diploma_id, type, db/fabric hash                          | Unique alert đang mở                                                      |

## Trường điều khiển luồng một cơ sở chính

- campuses.is_headquarters: đánh dấu cơ sở chính có thẩm quyền. Luồng hiện tại dùng cơ sở chính TP.HCM; code ORG2 được giữ tương thích dữ liệu.
- account_memberships.can_approve_diplomas: quyền nghiệp vụ trên membership đang hoạt động. Quyền này phải đi cùng role university tại trụ sở, không suy từ tên tài khoản hay role admin.
- diplomas.campus_id: cơ sở lập và quản lý hồ sơ nguồn; dữ liệu lịch sử vẫn được bảo toàn.
- diplomas.issuing_campus_id: cơ sở có thẩm quyền phát hành; hiện là cơ sở chính TP.HCM. Snapshot và anchor sử dụng MSP phát hành kỹ thuật Org1MSP, không có bước gửi sang Hà Nội.

## Mapping Excel → model

| Excel                       | Model mới                          | Độ tin cậy                                               |
| --------------------------- | ---------------------------------- | -------------------------------------------------------- |
| Mã sinh viên/MSSV           | students.student_code              | CORE; phải 10 chữ số                                     |
| Họ + tên                    | students.full_name                 | CORE; ghép theo cấu trúc sheet                           |
| Ngày sinh                   | students.date_of_birth             | CORE khi xác minh; lỗi thì staging                       |
| Lớp/Khóa                    | academic_classes/enrollments       | CONTROL/OPTIONAL tùy sheet                               |
| Ngành đào tạo               | programs/program_aliases           | Không insert thẳng; phải map alias                       |
| Điểm hệ 4                   | graduation_records.gpa             | Optional nếu sổ không có; không suy classification       |
| Xếp loại TN                 | graduation_records.classification  | CORE cho cấp bằng                                        |
| Năm tốt nghiệp              | graduation_records.graduation_year | CORE; 2023 có dòng cần lấy gợi ý từ sheet                |
| Số hiệu VB                  | diplomas.certificate_no            | CORE để tạo Diploma                                      |
| Số vào sổ                   | diplomas.registry_no               | CORE để tạo Diploma                                      |
| Quyết định/ngày ký/người ký | graduation_decisions               | CONTROL và provenance                                    |
| Ghi chú, người nhận ký      | import_rows.raw/normalized_data    | Staging/OPTIONAL, không đưa vào hash nếu chưa được duyệt |

## Physical schema

Sinh từ database đã migrate; PostgreSQL catalog là nguồn của phần này. Nullable không có nghĩa là được tự suy dữ liệu.

### academic_classes

Lớp theo cơ sở

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| campus_id | uuid | Có | FK |
| code | varchar(100) | Có |  |
| cohort_code | varchar(40) | Không |  |
| created_at | timestamptz(3) | Có |  |

### account_memberships

Quyền theo campus

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| account_id | uuid | Có | FK |
| campus_id | uuid | Có | FK |
| role | Role | Có |  |
| active | boolean | Có |  |
| created_at | timestamptz(3) | Có |  |
| can_approve_diplomas | boolean | Có |  |

### accounts

Tài khoản đăng nhập

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| email | varchar(320) | Có |  |
| password_hash | varchar(255) | Có |  |
| display_name | varchar(255) | Có |  |
| student_id | uuid | Không | FK |
| active | boolean | Có |  |
| must_change_password | boolean | Có |  |
| session_version | integer | Có |  |
| created_at | timestamptz(3) | Có |  |
| updated_at | timestamptz(3) | Có |  |

### audit_logs

Audit append-only

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| institution_id | uuid | Không | FK |
| actor_id | uuid | Không | FK |
| actor_email | varchar(320) | Có |  |
| action | varchar(100) | Có |  |
| target | varchar(255) | Không |  |
| result | varchar(20) | Có |  |
| ip | varchar(100) | Không |  |
| user_agent | varchar(500) | Không |  |
| error_message | text | Không |  |
| metadata | jsonb | Không |  |
| created_at | timestamptz(3) | Có |  |

### blockchain_anchors

Index xác nhận commit từ Fabric

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| version_id | uuid | Có | FK |
| event_type | varchar(60) | Có |  |
| status | AnchorStatus | Có |  |
| channel | varchar(100) | Có |  |
| chaincode | varchar(100) | Có |  |
| transaction_id | varchar(100) | Không |  |
| block_number | bigint | Không |  |
| issuer_msp_id | varchar(100) | Không |  |
| payload_hash | char(64) | Có |  |
| committed_at | timestamptz(3) | Không |  |
| last_error | text | Không |  |
| created_at | timestamptz(3) | Có |  |

### campuses

Cơ sở và mapping MSP

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| institution_id | uuid | Có | FK |
| code | varchar(40) | Có |  |
| name | varchar(255) | Có |  |
| fabric_msp_id | varchar(100) | Không |  |
| created_at | timestamptz(3) | Có |  |
| is_headquarters | boolean | Có |  |

### diploma_events

Lịch sử nghiệp vụ append-only

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| diploma_id | uuid | Có | FK |
| event_type | varchar(60) | Có |  |
| actor_id | uuid | Không | FK |
| reason | text | Không |  |
| metadata | jsonb | Không |  |
| created_at | timestamptz(3) | Có |  |

### diploma_pdf_signatures

Chữ ký số và chứng thư đã dùng; PDF mới có một chữ ký, giữ nguyên chữ ký lịch sử

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| document_id | uuid | Có | FK |
| signature_order | integer | Có |  |
| field_name | varchar(80) | Có |  |
| actor_id | uuid | Có | FK |
| campus_id | uuid | Có | FK |
| signer_name | varchar(255) | Có |  |
| certificate_sha256 | char(64) | Có |  |
| certificate_serial | varchar(255) | Có |  |
| certificate_subject | text | Có |  |
| certificate_issuer | text | Có |  |
| valid_from | timestamptz(3) | Có |  |
| valid_to | timestamptz(3) | Có |  |
| signed_at | timestamptz(3) | Có |  |
| validation_evidence | jsonb | Không |  |

### diploma_versions

Snapshot bất biến đã phê duyệt

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| diploma_id | uuid | Có | FK |
| version | integer | Có |  |
| schema_version | varchar(20) | Có |  |
| payload | jsonb | Có |  |
| payload_hash | char(64) | Có |  |
| created_by_id | uuid | Không | FK |
| created_at | timestamptz(3) | Có |  |

### diplomas

Văn bằng và vòng đời pháp lý

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| institution_id | uuid | Có | FK |
| campus_id | uuid | Có | FK |
| graduation_id | uuid | Có | FK |
| certificate_no | varchar(120) | Có |  |
| registry_no | varchar(180) | Có |  |
| issued_on | date | Không |  |
| status | DiplomaStatus | Có |  |
| workflow_status | WorkflowStatus | Có |  |
| current_version | integer | Có |  |
| requested_by_id | uuid | Không | FK |
| approved_by_id | uuid | Không | FK |
| requested_at | timestamptz(3) | Không |  |
| approved_at | timestamptz(3) | Không |  |
| supersedes_id | uuid | Không | FK |
| revoked_reason | text | Không |  |
| revoked_at | timestamptz(3) | Không |  |
| created_at | timestamptz(3) | Có |  |
| updated_at | timestamptz(3) | Có |  |
| issuing_campus_id | uuid | Không | FK |
| print_template | varchar(60) | Không |  |
| full_name_latin | varchar(255) | Không |  |
| major_name_en | varchar(255) | Không |  |
| issue_place | varchar(120) | Không |  |
| diploma_signer_name | varchar(255) | Không |  |
| diploma_signer_title | varchar(120) | Không |  |
| origin_type | varchar(20) | Có |  |

### enrollments

Quá trình theo học ngành/cơ sở/lớp

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| student_id | uuid | Có | FK |
| program_id | uuid | Có | FK |
| campus_id | uuid | Có | FK |
| class_id | uuid | Không | FK |
| start_year | smallint | Không |  |
| end_year | smallint | Không |  |
| cohort_code | varchar(40) | Không |  |
| created_at | timestamptz(3) | Có |  |

### graduation_decisions

Quyết định tốt nghiệp dùng chung

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| institution_id | uuid | Có | FK |
| document_number | varchar(120) | Có |  |
| decision_year | smallint | Có |  |
| signed_on | date | Không |  |
| signer_name | varchar(255) | Không |  |
| source_document_id | uuid | Không | FK |
| created_at | timestamptz(3) | Có |  |

### graduation_records

Kết quả tốt nghiệp, kể cả chưa có bằng

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| institution_id | uuid | Có | FK |
| student_id | uuid | Có | FK |
| program_id | uuid | Có | FK |
| enrollment_id | uuid | Không | FK |
| decision_id | uuid | Không | FK |
| source_row_id | uuid | Không | FK |
| graduation_year | smallint | Có |  |
| gpa | decimal(4,2) | Không |  |
| gpa_scale | smallint | Có |  |
| classification | Classification | Không |  |
| degree_type | DegreeType | Không |  |
| specialization | varchar(255) | Không |  |
| created_at | timestamptz(3) | Có |  |

### import_batches

Đợt nhập có mapping version

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| institution_id | uuid | Có | FK |
| campus_id | uuid | Có | FK |
| document_id | uuid | Có | FK |
| mapping_version | varchar(40) | Có |  |
| status | ImportStatus | Có |  |
| total_rows | integer | Có |  |
| imported_rows | integer | Có |  |
| created_by_id | uuid | Có | FK |
| created_at | timestamptz(3) | Có |  |
| completed_at | timestamptz(3) | Không |  |

### import_rows

Dòng nguồn và override đã review

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| batch_id | uuid | Có | FK |
| sheet_name | varchar(100) | Có |  |
| row_number | integer | Có |  |
| raw_data | jsonb | Có |  |
| normalized_data | jsonb | Có |  |
| overrides | jsonb | Không |  |
| status | ImportRowStatus | Có |  |
| reviewed_by_id | uuid | Không | FK |
| reviewed_at | timestamptz(3) | Không |  |
| created_at | timestamptz(3) | Có |  |

### institutions

Trường/đơn vị quản lý

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| code | varchar(40) | Có |  |
| name | varchar(255) | Có |  |
| created_at | timestamptz(3) | Có |  |
| name_en | varchar(255) | Không |  |

### integrity_alerts

Cảnh báo toàn vẹn và giải quyết

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| diploma_id | uuid | Có | FK |
| type | varchar(60) | Có |  |
| database_hash | char(64) | Không |  |
| fabric_hash | char(64) | Không |  |
| resolved_at | timestamptz(3) | Không |  |
| resolved_by_id | uuid | Không | FK |
| note | text | Không |  |
| created_at | timestamptz(3) | Có |  |

### legacy_id_maps

Mapping ID cũ; target_id đa hình không phải FK

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| source | varchar(100) | Có |  |
| entity | varchar(60) | Có |  |
| legacy_id | varchar(120) | Có |  |
| target_id | uuid | Có |  |
| created_at | timestamptz(3) | Có |  |

### otp_challenges

Thử thách OTP có giới hạn attempts

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| account_id | uuid | Có | FK |
| code_hash | char(64) | Có |  |
| expires_at | timestamptz(3) | Có |  |
| consumed_at | timestamptz(3) | Không |  |
| attempts | integer | Có |  |
| created_at | timestamptz(3) | Có |  |

### outbox_events

Hàng đợi giao dịch nhất quán và retry

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| version_id | uuid | Có | FK |
| event_type | varchar(60) | Có |  |
| payload | jsonb | Có |  |
| status | OutboxStatus | Có |  |
| attempts | integer | Có |  |
| available_at | timestamptz(3) | Có |  |
| locked_until | timestamptz(3) | Không |  |
| lock_token | uuid | Không |  |
| last_error | text | Không |  |
| completed_at | timestamptz(3) | Không |  |
| created_at | timestamptz(3) | Có |  |

### program_aliases

Tên ngành nguồn đã được phê duyệt

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| institution_id | uuid | Có | FK |
| program_id | uuid | Có | FK |
| normalized_name | varchar(255) | Có |  |
| original_name | varchar(255) | Có |  |
| approved_by_id | uuid | Không | FK |
| created_at | timestamptz(3) | Có |  |

### programs

Danh mục ngành

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| institution_id | uuid | Có | FK |
| code | varchar(80) | Có |  |
| name | varchar(255) | Có |  |
| national_code | varchar(30) | Không |  |
| active | boolean | Có |  |
| created_at | timestamptz(3) | Có |  |
| name_en | varchar(255) | Không |  |

### refresh_sessions

Refresh-token rotation theo family

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| account_id | uuid | Có | FK |
| membership_id | uuid | Có | FK |
| family_id | uuid | Có |  |
| token_hash | char(64) | Có |  |
| expires_at | timestamptz(3) | Có |  |
| revoked_at | timestamptz(3) | Không |  |
| replaced_by_id | uuid | Không | FK |
| ip | varchar(100) | Không |  |
| user_agent | varchar(500) | Không |  |
| created_at | timestamptz(3) | Có |  |

### signed_diploma_documents

PDF ký số theo phiên bản; khóa lưu trữ và SHA-256

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| diploma_id | uuid | Có | FK |
| version | integer | Có |  |
| version_id | uuid | Không | FK |
| payload_hash | char(64) | Có |  |
| signing_mode | varchar(20) | Có |  |
| origin_pdf_key | varchar(500) | Có |  |
| origin_pdf_hash | char(64) | Có |  |
| signed_pdf_key | varchar(500) | Không |  |
| signed_pdf_hash | char(64) | Không |  |
| byte_size | integer | Có |  |
| created_at | timestamptz(3) | Có |  |
| completed_at | timestamptz(3) | Không |  |

### source_documents

Metadata file gốc bất biến

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| institution_id | uuid | Có | FK |
| file_name | varchar(255) | Có |  |
| sha256 | char(64) | Có |  |
| byte_size | integer | Có |  |
| media_type | varchar(100) | Có |  |
| storage_key | varchar(500) | Có |  |
| uploaded_by_id | uuid | Không | FK |
| created_at | timestamptz(3) | Có |  |

### students

Hồ sơ người học, độc lập tài khoản

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| institution_id | uuid | Có | FK |
| student_code | varchar(40) | Có |  |
| full_name | varchar(255) | Có |  |
| date_of_birth | date | Không |  |
| birth_place | varchar(255) | Không |  |
| gender | Gender | Không |  |
| ethnicity | varchar(80) | Không |  |
| nationality | varchar(100) | Không |  |
| contact_email | varchar(320) | Không |  |
| phone | varchar(30) | Không |  |
| created_at | timestamptz(3) | Có |  |
| updated_at | timestamptz(3) | Có |  |

### validation_issues

Lỗi/cảnh báo gắn dòng nguồn

| Cột | Kiểu | Bắt buộc | Khóa |
|---|---|---|---|
| id | uuid | Có | PK |
| row_id | uuid | Có | FK |
| field | varchar(80) | Có |  |
| code | varchar(80) | Có |  |
| severity | IssueSeverity | Có |  |
| message | text | Có |  |
| resolved_at | timestamptz(3) | Không |  |
| created_at | timestamptz(3) | Có |  |
