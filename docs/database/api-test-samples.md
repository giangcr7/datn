## 2. Tài khoản và phiên

### POST /auth/login — công khai

```json
{
  "email": "<BOOTSTRAP_ORG2_EMAIL>",
  "password": "<MAT_KHAU_HIEN_TAI>",
  "role": "university"
}
```

Đăng nhập HCM để lập hồ sơ; đăng nhập `university` Hà Nội (`BOOTSTRAP_ORG1_*`) để duyệt. Admin dùng role admin cho tài khoản/audit, không được duyệt thay nhà trường. Sinh viên dùng role student và mật khẩu đã kích hoạt; không có tài khoản sinh viên mặc định.

### POST /auth/refresh — công khai, token dùng một lần

```json
{ "refreshToken": "<REFRESH_TOKEN_MOI_NHAT>" }
```

Lưu cả access_token và refresh_token mới. Dùng lại refresh token cũ sẽ vô hiệu hóa họ phiên, có thể thu hồi access token đang dùng.

### POST /auth/logout — công khai

```json
{ "refreshToken": "<REFRESH_TOKEN_MOI_NHAT>" }
```

Thu hồi refresh token; access token có thể còn hiệu lực đến hạn. Dùng logout-all nếu cần thu hồi access token ngay.

### POST /auth/logout-all — Bearer, mọi vai trò

Không cần body; nếu công cụ yêu cầu body thì dùng:

```json
{}
```

Sau lệnh phải đăng nhập lại; đặt bước này cuối chuỗi test.

### POST /auth/change-password/ACCOUNT_ID — Bearer, chỉ chính mình

```json
{ "oldPassword": "<MAT_KHAU_HIEN_TAI>", "newPassword": "Local-Test-2026!New" }
```

Đổi mật khẩu thật và thu hồi các phiên; chỉ test trên tài khoản riêng, sau đó đăng nhập lại bằng mật khẩu mới.

### POST /auth/send-otp — công khai

```json
{ "mssv": "0099999991", "email": "student.test@example.com" }
```

Tài khoản sinh viên phải được cấp trước, chưa kích hoạt; email phải khớp và SMTP phải hoạt động. Để test nhận email, thay example.com bằng hộp thư thử nghiệm anh kiểm soát.

### POST /auth/register — công khai

```json
{
  "mssv": "0099999991",
  "email": "student.test@example.com",
  "password": "Student-Local-2026!",
  "otp": "<OTP_TRONG_EMAIL>",
  "role": "student"
}
```

Đây là kích hoạt tài khoản đã cấp, không đăng ký tự do tài khoản cán bộ/admin. Không dùng OTP giả để kỳ vọng thành công.

## 3. Sinh viên — cán bộ/admin

### POST /students — tạo hồ sơ và tài khoản chờ kích hoạt

```json
{
  "name": "Sinh viên kiểm thử",
  "email": "student.test@example.com",
  "studentId": "0099999991"
}
```

MSSV là chuỗi 10 chữ số. Tạo hồ sơ này trước khi dùng mẫu POST /cert/request trong hướng dẫn cũ. Endpoint không trả mật khẩu ngẫu nhiên; sinh viên kích hoạt qua OTP.

### POST /students/import — import danh sách cấp tài khoản

```json
{ "fileName": "students-test.xlsx", "fileData": "<BASE64_XLSX>" }
```

Workbook có hàng đầu là MSSV, Họ và tên, Email; tối đa 1000 sinh viên, 5 MB. Đây **không phải** importer sổ gốc. Kết quả created/skipped/errors phải được kiểm tra vì có thể thành công một phần.

## 4. Import sổ gốc — cán bộ/admin

### POST /imports/registry/preview — đọc/validate, chưa stage

```json
{ "fileName": "so-goc-test.xlsx", "fileData": "<BASE64_XLSX>" }
```

Giữ đúng layout/sheet theo sổ gốc đã hỗ trợ; không dùng workbook tài khoản ở mục 3.

### POST /imports/registry — lưu file và staging

Dùng **cùng body preview**. Trả batchId, reused và summary. Chưa tạo students/graduation/diplomas từ batch. Stage lại cùng file/campus/mapping trả lại batch cũ.

### PATCH /imports/BATCH_ID/rows/ROW_ID — sửa dữ liệu đã đối soát

```json
{
  "corrections": {
    "studentCode": "0099999991",
    "fullName": "Sinh viên kiểm thử",
    "dateOfBirth": "2002-01-01",
    "programId": "<PROGRAM_UUID_TU_DANH_MUC>",
    "graduationYear": 2024,
    "gpa": null,
    "gpaScale": 4,
    "classification": "GOOD",
    "certificateNo": "TEST-20261015-IMPORT-001",
    "registryNo": "TEST/20261015/IMPORT/001",
    "issuedOn": "2024-10-15"
  },
  "note": "Đã đối chiếu các trường sửa với hồ sơ gốc kiểm thử"
}
```

Chỉ gửi trường cần sửa, không bắt buộc gửi toàn bộ corrections trên. Không suy đoán MSSV/ngày sinh/ngày cấp/GPA/xếp loại. GPA không có trong nguồn thì để null. Classification: AVERAGE, AVERAGE_GOOD, GOOD, VERY_GOOD, EXCELLENT. READY không có nghĩa đã cấp/đã lên blockchain.

### POST /imports/BATCH_ID/commit — nhập các dòng READY

Không cần body; có thể dùng:

```json
{}
```

Kiểm tra imported/diplomas/conflicts và lỗi từng dòng. Dòng đủ số hiệu + số vào sổ tạo văn bằng DRAFT; thiếu cả hai chỉ lưu tốt nghiệp. Số hóa giữ ngày cấp trống nếu nguồn thật sự không ghi, có cảnh báo NOT_IN_SOURCE và nguồn gốc trong snapshot; không suy ngày cấp từ quyết định hoặc ngày ký số. Cấp mới luôn cần ngày cấp thực tế. Commit lại không nhập lại dòng IMPORTED.

### POST /imports/program-aliases — phê duyệt tên ngành tương đương

```json
{
  "programId": "<PROGRAM_UUID_TU_DANH_MUC>",
  "originalName": "CNTT - hệ chính quy",
  "note": "Đã đối chiếu với ngành Công nghệ thông tin trong danh mục chuẩn"
}
```

Alias không tạo ngành mới; PROGRAM_ID phải thuộc trường hiện hành. Tạo alias trước rồi review lại dòng bị UNMAPPED_PROGRAM.

## 5. Gửi văn bằng DRAFT duyệt — HCM gửi, Hà Nội duyệt

POST /cert/UUID/submit (dùng UUID của DRAFT sau import):

```json
{}
```

Ngày cấp giữ đúng dữ liệu đã đối chiếu, không sửa khi gửi; sổ gốc thật sự không ghi ngày cấp vẫn được gửi số hóa và hiển thị rõ thông tin thiếu. Sau submit là PENDING/REQUESTED, chưa có anchor phát hành. Dùng token HCM để gửi; Hà Nội kiểm tra và ký phát hành bằng POST /cert/approve/UUID. Chỉ sau Fabric commit mới là ON_CHAIN với issuerMspId=Org1MSP; campus nguồn vẫn là HCM/ORG2. HCM, admin và người lập không được tự duyệt.

### Đối chiếu thông tin bằng nháp — PATCH /cert/UUID/print-data

Chỉ cán bộ HCM, trước khi ký/gửi; thông tin người ký trên bằng không phải người ký quyết định tốt nghiệp.

```json
{
  "degreeType": "BACHELOR",
  "majorNameEn": "Information Technology",
  "issuePlace": "Hà Nội",
  "diplomaSignerTitle": "HIỆU TRƯỞNG",
  "diplomaSignerName": "Người ký trên bằng gốc",
  "note": "Đã đối chiếu với văn bằng thật"
}
```

POST /cert/bulk/print-data nhận {"diplomaIds":["UUID"],"printData":{...các trường trên...}}; tối đa 100 hồ sơ mỗi lần. GET /cert/UUID/preview trả PDF xem trước có nhãn chưa ký, không lưu file vào kho và không ghi blockchain.

### Lập yêu cầu cấp mới — POST /cert/request

MSSV phải tồn tại trong trường; cấp mới cần đủ loại bằng, tên ngành tiếng Anh, ngày/nơi cấp, họ tên/chức danh người ký bằng. fullNameLatin có thể bỏ trống để dùng họ tên bỏ dấu. GPA không bắt buộc và không in trên mặt bằng.

```json
{
  "mssv": "0099999991", "fullName": "Sinh viên kiểm thử", "dob": "2002-01-01",
  "major": "Công nghệ thông tin", "majorNameEn": "Information Technology", "degreeType": "BACHELOR",
  "grade": "Khá", "gpa": null, "namTotNghiep": 2024, "className": "TEST-IT",
  "soHieu": "TEST-001", "soVaoSo": "TEST/001", "issueDate": "2024-10-15", "issuePlace": "Hà Nội",
  "diplomaSignerName": "Người ký bằng kiểm thử", "diplomaSignerTitle": "HIỆU TRƯỞNG", "org": "ORG2"
}
```

## 6. Kiểm tra toàn vẹn — cán bộ/admin

### POST /integrity/check?days=1&limit=50

Không cần body; có thể dùng {}. Chỉ so những bằng có ISSUE anchor COMMITTED. days=0 để quét tất cả, limit từ 1 đến 500. Khi không có bằng on-chain, checked=0 không có nghĩa đã kiểm thử Fabric.

### POST /integrity/alerts/ALERT_ID/resolve

```json
{ "note": "Đã đối chiếu snapshot, giao dịch và biên bản xử lý kiểm thử" }
```

Chỉ dùng ID cảnh báo trong phạm vi quyền, đã xử lý thực tế. Đánh dấu resolved không sửa payload bất biến hoặc dữ liệu blockchain.

## 7. Các chức năng chỉ đọc — không gửi JSON body

| Endpoint sau base URL                                          | Vai trò/điều kiện                                |
| -------------------------------------------------------------- | ------------------------------------------------ |
| GET /health                                                    | Công khai; health PostgreSQL/API                 |
| GET /auth/me                                                   | Mọi vai trò đã đăng nhập                         |
| GET /auth/users                                                | ADMIN, trong trường hiện hành                    |
| GET /students?page=1&limit=20&search=0099999991                | Cán bộ/admin                                     |
| GET /imports/programs                                          | Cán bộ/admin; response là array                  |
| GET /imports?page=1&limit=20                                   | Cán bộ/admin                                     |
| GET /imports/BATCH_ID/rows?page=1&limit=20&status=NEEDS_REVIEW | Cán bộ/admin; bỏ status để xem tất cả            |
| GET /cert?page=1&limit=20&search=0099999991                    | Cán bộ/admin hoặc chính sinh viên                |
| GET /cert/pending                                              | HCM xem phạm vi cơ sở; Hà Nội xem hàng chờ toàn trường; admin chỉ đọc/không duyệt |
| GET /cert/statistics                                           | Cán bộ/admin hoặc chính sinh viên                |
| GET /cert/student/0099999991                                   | Cán bộ/admin hoặc chính sinh viên                |
| GET /cert/UUID                                                 | Cán bộ/admin hoặc chính sinh viên                |
| GET /cert/UUID/history                                         | Cán bộ/admin                                     |
| GET /cert/search?q=0099999991                                  | Ưu tiên token; public directory mặc định bị đóng |
| GET /audit?page=1&limit=20&action=REQUEST_CERT                 | ADMIN, trong trường hiện hành                    |
| GET /audit/user/ACCOUNT_ID                                     | ADMIN, trong trường hiện hành                    |
| GET /integrity/alerts?resolved=false                           | Cán bộ/admin                                     |
| GET /integrity/debug                                           | Cán bộ/admin                                     |
| GET /explorer/overview                                         | Cần Fabric đang chạy                             |
| GET /explorer/blocks?page=1&limit=10                           | Cần Fabric đang chạy                             |
| GET /explorer/blocks/BLOCK_NUMBER                              | Số block thật trên Fabric                        |
| GET /explorer/tx/TX_ID                                         | TxID thật trên Fabric                            |

## 8. Tạo body base64 đúng từ file Excel

Không copy chuỗi placeholder BASE64_XLSX để kỳ vọng API nhận file. Chạy PowerShell với **file kiểm thử**, lấy JSON rồi dán vào Swagger (hoặc đặt biến xlsxBase64 trong Postman):

```powershell
$file = 'D:/datn/diplomachain/duong-dan/so-goc-test.xlsx'
$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file))
$body = @{ fileName = [IO.Path]::GetFileName($file); fileData = $base64 } | ConvertTo-Json
$body | Set-Clipboard
```

## 9. Test âm bắt buộc

- Không token → 401; role sai hoặc ngoài campus → 403/không trả dữ liệu ngoài quyền.
- MSSV chưa có hồ sơ → request bị từ chối, không tự tạo student.
- Ngày cấp trước ngày sinh, trước năm tốt nghiệp, ở tương lai → 400, không ghi văn bằng.
- Tự approve → 403; approve lại → 409, không nhân đôi version/outbox.
- Trùng số hiệu/số vào sổ → 409; không tự gán số giả.
- Khi Fabric tắt: approve chỉ ANCHOR_PENDING, verify isValid=false; không giả VERIFIED/ON_CHAIN.
- POST /cert/issue là luồng cũ **chủ động bị khóa**; không có mẫu success và không dùng cho chức năng cấp mới.
