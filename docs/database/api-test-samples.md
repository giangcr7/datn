# Hướng dẫn test API bằng Postman

Cập nhật **29/10/2026**, đối chiếu controller, DTO và service đang có trong repository.
Luồng nghiệp vụ: **một cơ sở chính TP.HCM, một cán bộ duyệt/phát hành**, không còn bước gửi Hà Nội.
Tài liệu là hợp đồng và mẫu test đối chiếu mã nguồn; **không phải biên bản xác nhận đã chạy thành công mọi request trên dữ liệu thật**.

## 1. Link để mở và file để import

| Mục                                 | Link/file                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| Website                             | http://localhost:3000                                                                    |
| API gốc                             | http://localhost:3001/api                                                                |
| Kiểm tra dịch vụ                    | http://localhost:3001/api/health                                                         |
| Swagger                             | http://localhost:3001/docs                                                               |
| Swagger JSON                        | http://localhost:3001/docs-json                                                          |
| Bộ request có mẫu nhập              | [api-test-samples.postman_collection.json](./api-test-samples.postman_collection.json)   |
| Environment local không chứa bí mật | [api-test-samples.postman_environment.json](./api-test-samples.postman_environment.json) |
| Tác dụng đầy đủ 27 bảng             | [vai-tro-cac-bang-va-chuc-nang.md](./vai-tro-cac-bang-va-chuc-nang.md)                   |

Các link localhost chỉ dùng trên máy đang chạy API/web. Máy khác cần thay hostname và cấu hình truy cập; API đổi PORT thì sửa `baseUrl`.
Đối với Postman, **gọi NestJS cổng 3001**. Các route Next.js cổng 3000 thường cần cookie NextAuth và không thay thế bằng Bearer JWT của NestJS. Riêng chat trợ lý nằm trên cổng 3000.

## 2. Thiết lập Postman và nguyên tắc an toàn

1. Import collection và environment JSON, rồi chọn environment **DiplomaChain - LOCAL**.
2. Chỉ điền mật khẩu/token vào giá trị local/private của environment. Không export, commit hoặc chia sẻ bản đã điền bí mật, OTP, dữ liệu Excel cá nhân.
3. Đặt `baseUrl=http://localhost:3001/api`; điền `staffEmail` và `staffPassword` là tài khoản cán bộ hiện có. Không tạo tài khoản từ ví dụ email nếu chưa có trong DB.
4. Gửi **Dang nhap can bo co so chinh**. Script tự lưu `accessToken, refreshToken, accountId` vào environment. Đăng nhập admin/sinh viên lưu token riêng.
5. Request bảo vệ dùng Authorization → Bearer Token `{{accessToken}}`; các request admin dùng `{{adminToken}}`. JSON dùng Body → raw → JSON.
6. Gửi từng request theo một kịch bản. **Không Run All/Run Folder**: duyệt và từ chối là hai nhánh; thay thế và thu hồi không chạy nối tiếp tùy tiện trên cùng bằng.
7. Request `[GHI]` bị bỏ qua khi `allowMutations=false`. Chỉ bật `allowMutations=true` cho thao tác đã chọn trên DB/Fabric thử nghiệm tách biệt, rồi tắt lại.
8. Request `[NHAY_CAM]` cần thêm `allowSensitiveActions=true`; áp dụng thu hồi, mật khẩu, refresh/logout và gọi chat có thể dùng quota AI. Tắt cả hai cờ sau thao tác.

Collection dùng `pm.execution.skipRequest()` ở pre-request script; cần phiên bản Postman hỗ trợ API này. Nếu Console báo lỗi script, **dừng gửi request và cập nhật Postman**, không bỏ guard để chạy toàn bộ.
Script cũng bỏ qua request nếu biến trong URL/body/Bearer còn trống. Đăng nhập vẫn tạo phiên và audit; xác thực/đối chiếu có thể tạo audit nhưng không tạo giao dịch ghi Fabric.
HTTP 2xx chỉ chứng minh API chấp nhận/trả kết quả, không tự chứng minh văn bằng hợp lệ hay tất cả dòng bulk thành công.

### Biến cần điền và lấy ở đâu

| Biến                                                         | Nguồn/cách nhập                                                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `staffEmail, staffPassword`                                  | Tài khoản cán bộ hiện có; mật khẩu rõ anh dùng đăng nhập, không phải hash.                                                          |
| `adminEmail, adminPassword`                                  | Chỉ cần khi test ADMIN.                                                                                                             |
| `studentCode, fullName, dob, studentEmail`                   | Dữ liệu giả cùng một sinh viên. MSSV 10 chữ số; DOB dạng YYYY-MM-DD; email có thật do anh quản lý nếu test gửi OTP.                 |
| `studentPassword, otp`                                       | Tự đặt mật khẩu mới và OTP nhận qua email khi kích hoạt. Không dùng hash trong DB làm OTP.                                          |
| `programId, programCode, major`                              | Chọn đúng `id, code, name` từ GET /catalog/programs; major khi lập hồ sơ phải có alias đã duyệt.                                    |
| `testRunId`                                                  | Đổi mỗi lần tạo dữ liệu mới, ví dụ 20261029-02; tránh trùng số hiệu/số vào sổ. Không tự động đổi để tránh tạo bản ghi ngoài ý muốn. |
| `certUUID`                                                   | `uuid` trả từ POST /cert/request hoặc chọn đúng hồ sơ trong pending/register.                                                       |
| `batchId`                                                    | Script lấy `batchId` sau POST /imports/registry.                                                                                    |
| `rowId`                                                      | `id` của dòng cần xử lý từ GET /imports/BATCH_ID/rows.                                                                              |
| `draftUUID`                                                  | `uuid` hồ sơ nháp từ GET /cert/candidates; không phải rowId.                                                                        |
| `rejectedUUID`                                               | Một hồ sơ riêng để test từ chối/mở lại/sửa/trình lại.                                                                               |
| `sourceUUID, replacementUUID`                                | UUID văn bằng gốc đã commit và UUID hồ sơ thay thế mới. create tự lưu replacementUUID.                                              |
| `correctionUpdatedAt, sourceUpdatedAt, replacementUpdatedAt` | Script lưu khi GET đúng chi tiết tại nhóm 07/08. Sau mỗi thao tác phải GET lại; script xóa mốc cũ để không dùng nhầm.               |
| `anchorId, expectedRetryToken`                               | Cùng một phần tử của GET /explorer/anchors?status=EXHAUSTED: `id` và `outbox.retryToken`. Không tự bịa token.                       |
| `txId, blockNumber`                                          | Từ anchor COMMITTED; không dùng UUID văn bằng thay txId.                                                                            |
| `alertId`                                                    | `id` cảnh báo thực tế từ GET /integrity/alerts.                                                                                     |
| `currentPassword, newPassword`                               | Chỉ điền trước khi thử đổi mật khẩu của chính tài khoản đang đăng nhập.                                                             |

Chỉ lấy một bản ghi phù hợp để thử; collection không tự chọn ngành/UUID/giao dịch đầu tiên cho anh.
Mẫu dùng tên giả **Nguyễn Văn Kiểm Thử**, người ký **Nguyễn Văn Mẫu** và tiền tố TEST; không dùng các giá trị đó trên hồ sơ thật.

## 3. Quyền của các nhóm chức năng

| Nhóm                                                     | Ai được dùng?                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Đăng nhập, OTP, kích hoạt, tra cứu, xác thực UUID/PDF    | Công khai nhưng có giới hạn tần suất; OTP/đăng ký cần dữ liệu sinh viên có sẵn.                        |
| Danh mục, import, lập/sửa/duyệt/từ chối/thay thế/thu hồi | Cán bộ UNIVERSITY tại cơ sở chính có `canApproveDiplomas=true`.                                        |
| Tổng quan, sổ văn bằng, lịch sử, audit, integrity        | ADMIN hoặc UNIVERSITY theo phạm vi quyền.                                                              |
| Explorer/đối chiếu/thử lại                               | ADMIN hoặc UNIVERSITY cơ sở chính có capability; kiểm tra trạng thái/chống chạy đồng thời tại service. |
| Danh sách sinh viên                                      | ADMIN hoặc UNIVERSITY; sinh viên không được xem danh sách.                                             |
| Chi tiết/tải PDF/văn bằng theo MSSV                      | ADMIN, UNIVERSITY, hoặc STUDENT sở hữu bản ghi; không vượt phạm vi.                                    |
| Danh sách tài khoản, audit theo tài khoản                | ADMIN.                                                                                                 |
| Đổi mật khẩu/logout-all                                  | Chính tài khoản trong JWT; admin không dùng endpoint này để đổi hộ người khác.                         |
| Chat hướng dẫn                                           | Công khai; ngữ cảnh lỗi kiểm tra dữ liệu cần cookie phiên web của cán bộ.                              |

GET /auth/me phải cho thấy `role=university, isHeadquarters=true, canApproveDiplomas=true` trước khi duyệt.
Role ADMIN không mặc nhiên được ký phát hành; không cần tài khoản Hà Nội.

## 4. Mẫu nhập quan trọng

### 4.1. Đăng nhập và tạo sinh viên

**POST http://localhost:3001/api/auth/login**, No Auth:

```json
{
  "email": "{{staffEmail}}",
  "password": "{{staffPassword}}",
  "role": "university"
}
```

Kết quả đăng nhập có `access_token, refresh_token, user.id` (không phải tên `accessToken` trong JSON phản hồi).
Đổi `role` thành `admin` hoặc `student` và dùng đúng tài khoản nếu test vai trò đó.

**POST http://localhost:3001/api/students**, Bearer cán bộ:

```json
{
  "name": "Nguyễn Văn Kiểm Thử",
  "email": "student.test@example.com",
  "studentId": "9900000091"
}
```

`studentId` ở API này là MSSV. Có sinh viên chưa đồng nghĩa đã có văn bằng hoặc đã kích hoạt tài khoản.

### 4.2. Ngành chuẩn và alias

GET http://localhost:3001/api/catalog/programs để chọn `programId`. Thêm ngành chỉ khi thực sự cần ngành thử nghiệm:

**POST /catalog/programs** (PATCH /catalog/programs/PROGRAM_UUID dùng cùng bộ trường):

```json
{
  "code": "TEST-20261029-01",
  "name": "Ngành kiểm thử 20261029-01",
  "nameEn": "Test Program 20261029-01",
  "note": "Tạo danh mục trong môi trường kiểm thử tách biệt"
}
```

**POST /catalog/program-aliases** hoặc /imports/program-aliases, chọn một endpoint:

```json
{
  "programId": "{{programId}}",
  "originalName": "CNTT TEST 20261029-01",
  "note": "Đã đối chiếu tên tương đương với ngành chuẩn"
}
```

Nếu `major` trong request là “Công nghệ thông tin”, phải có alias tương ứng tên đó; alias CNTT TEST không tự ánh xạ mọi tên khác.

### 4.3. Nhập Excel, kiểm tra trùng và review

Body của POST /imports/registry/preview và POST /imports/registry:

```json
{
  "fileName": "{{xlsxFileName}}",
  "fileData": "{{xlsxBase64}}"
}
```

- Preview: phân tích trước, chưa commit dữ liệu nghiệp vụ.
- Stage: lưu tài liệu nguồn/đợt nhập/dòng/lỗi, trả `batchId`. Cùng nguồn có thể trả `reused=true`.
- GET /imports/BATCH_ID/rows và /imports/BATCH_ID/rows/ROW_ID/duplicates chỉ ra dòng nào trùng để so sánh.
- PATCH /imports/BATCH_ID/rows/ROW_ID dùng JSON sau; chỉ giữ trường thực sự sửa:

```json
{
  "corrections": {
    "programId": "{{programId}}",
    "dateOfBirth": "2002-01-15",
    "issuedOn": "2026-10-20",
    "classification": "GOOD",
    "gpa": 3.2,
    "gpaScale": 4
  },
  "note": "Đã đối chiếu từng giá trị sửa với nguồn hồ sơ"
}
```

Tên trường import là `studentCode/dateOfBirth/certificateNo/registryNo/issuedOn`, khác với `mssv/dob/soHieu/soVaoSo/issueDate` ở hồ sơ văn bằng.
Sau thêm alias, chạy POST /imports/BATCH_ID/recheck với `{}`. Commit bằng POST /imports/BATCH_ID/commit:

```json
{ "originType": "ISSUANCE" }
```

Dùng `DIGITIZATION` chỉ khi số hóa sổ gốc thực sự. Không suy ngày cấp/GPA/xếp loại còn thiếu.
Xem số dòng `imported`, số văn bằng `diplomas` và `conflicts`/lỗi từng dòng. READY không có nghĩa đã phát hành hoặc đã có trên blockchain.

#### Lấy base64 trên máy, không tạo file rác

Chạy tại thư mục dự án bằng PowerShell:

```powershell
$file = (Resolve-Path -LiteralPath '.\test\01_hop_le.xlsx').Path
[Convert]::ToBase64String([IO.File]::ReadAllBytes($file)) | Set-Clipboard
```

Dán clipboard vào giá trị local `xlsxBase64`; `xlsxFileName=01_hop_le.xlsx`. Base64 thuần, không có tiền tố `data:...`.
File phải là XLSX hợp lệ, không dán đường dẫn ổ D: vào `fileData`. Sổ gốc và Excel tài khoản sinh viên là hai mẫu khác nhau.
Excel tài khoản sinh viên cần hàng tiêu đề `MSSV | Họ và tên | Email`, tối đa 1.000 sinh viên/lần và 5 MB.
Xem [test/README.md](../../test/README.md) cho các file 2–3 dòng sẵn trên máy; không đưa workbook có dữ liệu cá nhân vào collection/Git.

### 4.4. Lập hồ sơ thủ công, duyệt và chờ commit

**POST http://localhost:3001/api/cert/request**, sau khi sinh viên và alias ngành đã có:

```json
{
  "mssv": "{{studentCode}}",
  "fullName": "{{fullName}}",
  "major": "{{major}}",
  "grade": "Khá",
  "gpa": 3.2,
  "soHieu": "TEST-{{testRunId}}-001",
  "soVaoSo": "TEST/{{testRunId}}/001",
  "className": "TEST-2026",
  "namTotNghiep": 2026,
  "dob": "{{dob}}",
  "issueDate": "{{issueDate}}",
  "degreeType": "BACHELOR",
  "fullNameLatin": "NGUYEN VAN KIEM THU",
  "majorNameEn": "Information Technology",
  "issuePlace": "TP. Hồ Chí Minh",
  "diplomaSignerName": "{{diplomaSignerName}}",
  "diplomaSignerTitle": "HIỆU TRƯỞNG"
}
```

Đây là hồ sơ `REQUESTED` ngay, không cần submit lần nữa. Script lưu `uuid` vào `certUUID`.
**Không lập lại thủ công cùng kết quả đã tạo từ Excel**; có thể bị 409 do trùng.

Với bằng nháp từ Excel: GET /cert/candidates → PATCH /cert/DRAFT_UUID/print-data → GET /cert/DRAFT_UUID/preview → POST /cert/bulk/submit:

```json
{ "diplomaIds": ["{{draftUUID}}"] }
```

Đối chiếu `issueDate, degreeType, majorNameEn, issuePlace, diplomaSignerName, diplomaSignerTitle` qua print-data và thêm `note`; ngày cấp không sửa tại bước submit.
Dùng bulk/submit cho **một hoặc nhiều** hồ sơ vì endpoint submit đơn đang có bất nhất DTO/service (mục 7).

Duyệt bằng **POST /cert/approve/{{certUUID}}**, body `{}`. Từ chối hồ sơ khác đang chờ bằng **POST /cert/reject/{{rejectedUUID}}**:

```json
{ "reason": "Cần bổ sung thông tin theo hồ sơ gốc" }
```

Bulk submit/approve nhận `diplomaIds`; bulk reject cần thêm `reason`, tối đa 100 UUID khác nhau.
Đọc `succeeded, failed, results`, không chỉ `success=true` ở cấp tổng.
Sau duyệt, trạng thái `ANCHOR_PENDING` là bình thường: worker gửi Fabric bất đồng bộ. Chỉ anchor `COMMITTED` và xác thực `isValid=true` mới kết luận theo kết quả kiểm tra hệ thống.

### 4.5. Hồ sơ bị từ chối và văn bằng thay thế

Mở lại hoặc trình lại cần lý do và mốc `updatedAt` lấy từ GET chi tiết **ngay trước thao tác**:

```json
{
  "note": "Đã đối chiếu nguồn và bổ sung hồ sơ",
  "expectedUpdatedAt": "{{correctionUpdatedAt}}"
}
```

Luồng từ chối: GET /cert/corrections?stage=REJECTED → GET chi tiết rejectedUUID → POST /cert/corrections/UUID/reopen → GET lại → PATCH /cert/corrections/UUID → GET lại → POST /cert/corrections/UUID/resubmit → duyệt tại nhóm 06.
PATCH yêu cầu bộ trường đầy đủ theo mẫu trong nhóm **07** của collection: họ tên, DOB, programId, năm TN, xếp loại, loại bằng, số hiệu/sổ/ngày cấp và thông tin in; không bọc trong `corrections`.

Văn bằng đã ký không dùng luồng sửa hồ sơ nháp. Chọn bằng gốc ACTIVE đã commit, GET /cert/SOURCE_UUID, rồi **POST /cert/replacements/SOURCE_UUID/create**:

```json
{
  "note": "Sửa sai theo hồ sơ gốc đã đối chiếu",
  "expectedUpdatedAt": "{{sourceUpdatedAt}}",
  "basis": "Quyết định điều chỉnh số TEST/QD/2026",
  "soHieu": "TEST-{{testRunId}}-REPL",
  "soVaoSo": "TEST/{{testRunId}}/REPL",
  "issueDate": "{{replacementIssueDate}}"
}
```

API trả UUID **mới**, lưu vào `replacementUUID`. Tiếp theo GET chi tiết mới → PATCH (nếu sửa) → GET lại → submit → GET lại → approve theo nhóm **08**.
Các action submit/reopen/reject/approve dùng `note, expectedUpdatedAt`; PATCH dùng cùng bộ trường của CorrectionEditDto.
Từ chối và duyệt là nhánh khác nhau. Không dùng UUID bằng gốc ở endpoint xử lý bản thay thế.
Sau duyệt thay thế, bằng gốc ngừng hiệu lực; nếu chain chưa commit bản mới thì chưa thể coi bản thay thế là hợp lệ. Không xóa bản cũ.

### 4.6. Tra cứu và xác thực không cần đăng nhập

**POST http://localhost:3001/api/cert/lookup**, No Auth:

```json
{
  "fullName": "Nguyễn Văn Kiểm Thử",
  "dob": "2002-01-15",
  "mssv": "9900000091"
}
```

Bắt buộc họ tên + ngày sinh + ít nhất một trong MSSV/số hiệu/số vào sổ. Mẫu nhập đầy đủ nằm trong nhóm **09**, gồm lớp, ngành, loại bằng, năm TN, xếp loại, GPA, ngày cấp, số/ngày quyết định.
Mỗi trường bổ sung phải đúng dữ liệu đã lưu; xóa trường chưa có, không nhập giá trị giả rồi mong API bỏ qua.
`[]` nghĩa không tìm thấy hồ sơ thỏa điều kiện công khai, không đồng nghĩa hệ thống đã kết luận bằng giả.

**POST http://localhost:3001/api/verify**, No Auth:

```json
{ "uuid": "{{certUUID}}" }
```

Kiểm tra `isValid`, `verificationStatus`, `message`. Các kết quả có thể gồm NOT_APPROVED, ANCHOR_PENDING, REVOKED, SUPERSEDED, REPLACEMENT_PENDING hoặc trạng thái đối chiếu khác.
Tra cứu không thay thế xác thực. Xác thực đọc blockchain, không tạo một block mới và không phải hành động phê duyệt.

**POST http://localhost:3001/api/verify/pdf**: Body → form-data, key **file**, Type **File**, chọn PDF đã tải từ GET /cert/UUID/pdf; tối đa 10 MB. Không chọn raw JSON, không thêm trường form khác, không tự gõ Content-Type/boundary.

### 4.7. Đối chiếu và xử lý giao dịch hết lượt thử

GET /explorer/anchors?status=EXHAUSTED&page=1&limit=20 → chọn đúng `id` và `outbox.retryToken` của cùng giao dịch.
POST /explorer/anchors/ANCHOR_ID/check dùng `{}`, trả MATCH/MISMATCH/PENDING/INCOMPLETE/UNAVAILABLE và ghi audit.
POST /explorer/anchors/ANCHOR_ID/retry:

```json
{
  "reason": "Đã khắc phục kết nối và kiểm tra nguyên nhân giao dịch thất bại",
  "expectedRetryToken": "{{expectedRetryToken}}"
}
```

Chỉ thử lại khi outbox FAILED đủ **10** lần, anchor FAILED chưa có bằng chứng commit/khóa xử lý và token vẫn mới; Fabric/outbox phải bật.
Lý do từ 10–2.000 ký tự, token hash 64 ký tự hex. Nếu trạng thái đổi phải tải danh sách lại, không tự thay token cho qua.
Service kiểm tra chain để tránh ghi trùng; retry không xóa lỗi lịch sử, không chỉnh hash gốc hoặc xóa block.

### 4.8. Thu hồi, mật khẩu và phiên đăng nhập

POST /cert/revoke, chỉ dùng bằng thử nghiệm chưa thay thế:

```json
{ "certUUID": "{{certUUID}}", "reason": "Thu hồi theo quyết định kiểm thử" }
```

POST /auth/change-password/ACCOUNT_UUID, JWT phải thuộc chính account đó:

```json
{ "oldPassword": "{{currentPassword}}", "newPassword": "{{newPassword}}" }
```

Mật khẩu mới ít nhất 6 ký tự; sau đổi đăng nhập lại và cập nhật giá trị local. Mật khẩu đã hash không dùng làm mật khẩu cũ.
POST /auth/refresh hoặc /auth/logout dùng `{"refreshToken":"{{refreshToken}}"}`. Refresh token được xoay vòng, không gửi lại token cũ; script giữ token mới.
POST /auth/logout-all dùng `{}` và Bearer của chính tài khoản muốn đăng xuất.

### 4.9. Chat hướng dẫn (route Next.js riêng)

**POST http://localhost:3000/api/assistant**, header `Content-Type: application/json` và `Origin: http://localhost:3000`:

```json
{ "question": "Tôi cần nhập thông tin gì để tra cứu văn bằng?" }
```

Câu hỏi 1–800 ký tự; cần cấu hình trợ lý trên server. Có thể phát sinh quota nhà cung cấp AI.
Giải thích lỗi theo ngữ cảnh `registry-issues` cần cookie NextAuth của cán bộ; Bearer NestJS không đủ. Không đưa cookie hoặc API key AI vào collection chia sẻ. Chat không ký/duyệt/xác thực thay chức năng chính.

## 5. Danh sách đầy đủ URL và phương thức

**86 request trong 13 nhóm**; các mẫu JSON/query/form-data cụ thể đã điền trong collection.
Trong URL, `{{...}}` là biến Postman: phải lấy từ phản hồi trước hoặc nhập đúng dữ liệu thử nghiệm.
Tên `[GHI]`/`[NHAY_CAM]` thể hiện cờ an toàn cần bật, không phải một phần URL.

### 01. Ket noi va dang nhap

Chọn environment local. Đăng nhập cán bộ tại cơ sở chính; kiểm tra me có canApproveDiplomas=true và isHeadquarters=true. Đăng nhập tạo phiên và nhật ký dù không gắn nhãn GHI.

| Request                               | Method | URL                                    |
| ------------------------------------- | ------ | -------------------------------------- |
| Health - ket noi PostgreSQL va Fabric | GET    | `http://localhost:3001/api/health`     |
| Dang nhap can bo co so chinh          | POST   | `http://localhost:3001/api/auth/login` |
| Ho so can bo dang dang nhap           | GET    | `http://localhost:3001/api/auth/me`    |
| Dang nhap admin - khong duyet thay    | POST   | `http://localhost:3001/api/auth/login` |
| Danh sach tai khoan - admin           | GET    | `http://localhost:3001/api/auth/users` |

### 02. Tong quan va so van bang

Các API danh sách chỉ hiển thị trong phạm vi quyền. Bộ lọc sổ là ON_CHAIN, REVOKED, REPLACED.

| Request                      | Method | URL                                                                       |
| ---------------------------- | ------ | ------------------------------------------------------------------------- |
| Tong quan cong viec          | GET    | `http://localhost:3001/api/dashboard/overview`                            |
| Thong ke van bang            | GET    | `http://localhost:3001/api/cert/statistics`                               |
| So van bang da phat hanh     | GET    | `http://localhost:3001/api/cert/register?page=1&limit=20&status=ON_CHAIN` |
| Danh sach ho so van bang     | GET    | `http://localhost:3001/api/cert?page=1&limit=20&search={{studentCode}}`   |
| Chi tiet van bang            | GET    | `http://localhost:3001/api/cert/{{certUUID}}`                             |
| Van bang theo MSSV           | GET    | `http://localhost:3001/api/cert/student/{{studentCode}}`                  |
| Tim kiem noi bo co dang nhap | GET    | `http://localhost:3001/api/cert/search?q={{studentCode}}`                 |
| Lich su mot van bang         | GET    | `http://localhost:3001/api/cert/{{certUUID}}/history`                     |
| Tai PDF da ky                | GET    | `http://localhost:3001/api/cert/{{certUUID}}/pdf`                         |

### 03. Danh muc nganh va anh xa

UNIVERSITY tại cơ sở chính có quyền duyệt. Chọn đúng programId và programCode từ danh sách, không tự động lấy ngành đầu tiên.

| Request                               | Method | URL                                                        |
| ------------------------------------- | ------ | ---------------------------------------------------------- |
| Danh muc nganh va alias               | GET    | `http://localhost:3001/api/catalog/programs`               |
| [GHI] Them nganh kiem thu             | POST   | `http://localhost:3001/api/catalog/programs`               |
| [GHI] Cap nhat nganh da chon          | PATCH  | `http://localhost:3001/api/catalog/programs/{{programId}}` |
| [GHI] Phe duyet ten nganh tuong duong | POST   | `http://localhost:3001/api/catalog/program-aliases`        |
| Danh muc nganh cho import             | GET    | `http://localhost:3001/api/imports/programs`               |
| [GHI] Them alias qua API import       | POST   | `http://localhost:3001/api/imports/program-aliases`        |

### 04. Sinh vien va kich hoat tai khoan

Tạo sinh viên trước khi POST /cert/request. Sinh viên mới phải nhận OTP qua SMTP; địa chỉ example.com chỉ là mẫu, cần thay bằng hộp thư do anh kiểm soát khi test gửi mail.

| Request                                        | Method | URL                                                                         |
| ---------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| Danh sach sinh vien                            | GET    | `http://localhost:3001/api/students?page=1&limit=20&search={{studentCode}}` |
| [GHI] Tao sinh vien va tai khoan cho kich hoat | POST   | `http://localhost:3001/api/students`                                        |
| [GHI] Nhap sinh vien tu Excel                  | POST   | `http://localhost:3001/api/students/import`                                 |
| [GHI] Gui OTP kich hoat sinh vien              | POST   | `http://localhost:3001/api/auth/send-otp`                                   |
| [GHI] Kich hoat sinh vien bang OTP             | POST   | `http://localhost:3001/api/auth/register`                                   |
| Dang nhap sinh vien                            | POST   | `http://localhost:3001/api/auth/login`                                      |
| Sinh vien xem van bang cua minh                | GET    | `http://localhost:3001/api/cert/student/{{studentCode}}`                    |

### 05. Excel - kiem tra trung - review - commit

Chọn file nhỏ trong test/ theo README. Preview không commit nghiệp vụ; stage lưu nguồn và đợt nhập. Kiểm tra lỗi trước khi commit. Mỗi dòng READY chỉ nhập một lần.

| Request                                          | Method | URL                                                                                      |
| ------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------- |
| Xem truoc file so goc                            | POST   | `http://localhost:3001/api/imports/registry/preview`                                     |
| [GHI] Luu dot kiem tra Excel                     | POST   | `http://localhost:3001/api/imports/registry`                                             |
| Danh sach dot nhap                               | GET    | `http://localhost:3001/api/imports?page=1&limit=20`                                      |
| Cac dong trong dot                               | GET    | `http://localhost:3001/api/imports/{{batchId}}/rows?page=1&limit=20`                     |
| Chi tiet ban ghi trung de so sanh                | GET    | `http://localhost:3001/api/imports/{{batchId}}/rows/{{rowId}}/duplicates?page=1&limit=5` |
| [GHI] Sua dong co doi soat                       | PATCH  | `http://localhost:3001/api/imports/{{batchId}}/rows/{{rowId}}`                           |
| [GHI] Kiem tra lai sau khi them alias            | POST   | `http://localhost:3001/api/imports/{{batchId}}/recheck`                                  |
| [GHI] Nhap dong READY de cap moi                 | POST   | `http://localhost:3001/api/imports/{{batchId}}/commit`                                   |
| [GHI] So hoa so goc - nhanh thay the cho cap moi | POST   | `http://localhost:3001/api/imports/{{batchId}}/commit`                                   |

### 06. Ho so cap van bang - duyet tai mot co so

Luồng A: tạo sinh viên -> request -> approve HOẶC reject. Luồng B từ Excel: commit -> candidates -> print-data -> preview -> bulk/submit -> pending -> approve. Cùng cán bộ được ủy quyền có thể lập và duyệt; không dùng tài khoản Hà Nội.

| Request                                         | Method | URL                                                                             |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| [GHI] Lap ho so cap moi cho sinh vien da co     | POST   | `http://localhost:3001/api/cert/request`                                        |
| Ho so nhap Excel du dieu kien luu               | GET    | `http://localhost:3001/api/cert/candidates?page=1&limit=20&batchId={{batchId}}` |
| [GHI] Doi chieu thong tin in bang nhap          | PATCH  | `http://localhost:3001/api/cert/{{draftUUID}}/print-data`                       |
| Xem PDF nhap                                    | GET    | `http://localhost:3001/api/cert/{{draftUUID}}/preview`                          |
| [GHI] Bo sung thong tin in theo nhom            | POST   | `http://localhost:3001/api/cert/bulk/print-data`                                |
| [GHI] Luu ban nhap vao hang cho tai co so chinh | POST   | `http://localhost:3001/api/cert/bulk/submit`                                    |
| Danh sach cho can bo duyet                      | GET    | `http://localhost:3001/api/cert/pending?page=1&limit=20`                        |
| [GHI] Duyet va ky phat hanh                     | POST   | `http://localhost:3001/api/cert/approve/{{certUUID}}`                           |
| [GHI] Tu choi ho so khac dang cho               | POST   | `http://localhost:3001/api/cert/reject/{{rejectedUUID}}`                        |
| [GHI] Duyet nhom ho so                          | POST   | `http://localhost:3001/api/cert/bulk/approve`                                   |
| [GHI] Tu choi nhom ho so                        | POST   | `http://localhost:3001/api/cert/bulk/reject`                                    |

### 07. Ho so bi tu choi - bo sung va trinh lai

Chỉ hồ sơ chưa ký, chưa có phiên bản bất biến. Sau MỖI thao tác mở lại/sửa/trình, gọi lại GET chi tiết để lấy updatedAt mới. Không dùng mốc ngày giờ tự đặt.

| Request                            | Method | URL                                                                         |
| ---------------------------------- | ------ | --------------------------------------------------------------------------- |
| Danh sach ho so bi tu choi         | GET    | `http://localhost:3001/api/cert/corrections?stage=REJECTED&page=1&limit=20` |
| Tai lai chi tiet ho so can sua     | GET    | `http://localhost:3001/api/cert/{{rejectedUUID}}`                           |
| [GHI] Mo lai ho so REJECTED        | POST   | `http://localhost:3001/api/cert/corrections/{{rejectedUUID}}/reopen`        |
| [GHI] Sua ho so dang bo sung       | PATCH  | `http://localhost:3001/api/cert/corrections/{{rejectedUUID}}`               |
| [GHI] Trinh duyet lai ho so da sua | POST   | `http://localhost:3001/api/cert/corrections/{{rejectedUUID}}/resubmit`      |

### 08. Sua sai va phat hanh van bang thay the

Không sửa trực tiếp bản đã ký/hash bất biến. sourceUUID là văn bằng ACTIVE đã COMMITTED và chưa có thay thế/thu hồi. replacementUUID là hồ sơ MỚI được API create trả về.

| Request                                     | Method | URL                                                                       |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| Danh sach ho so thay the                    | GET    | `http://localhost:3001/api/cert/replacements?stage=DRAFT&page=1&limit=20` |
| Tai lai van bang goc truoc khi tao thay the | GET    | `http://localhost:3001/api/cert/{{sourceUUID}}`                           |
| [GHI] Tao ho so thay the cho van bang goc   | POST   | `http://localhost:3001/api/cert/replacements/{{sourceUUID}}/create`       |
| Tai lai ho so thay the sau moi thao tac     | GET    | `http://localhost:3001/api/cert/{{replacementUUID}}`                      |
| [GHI] Sua noi dung ban thay the DRAFT       | PATCH  | `http://localhost:3001/api/cert/replacements/{{replacementUUID}}`         |
| [GHI] Trinh ban thay the                    | POST   | `http://localhost:3001/api/cert/replacements/{{replacementUUID}}/submit`  |
| [GHI] Tu choi ban thay the                  | POST   | `http://localhost:3001/api/cert/replacements/{{replacementUUID}}/reject`  |
| [GHI] Mo lai ban thay the bi tu choi        | POST   | `http://localhost:3001/api/cert/replacements/{{replacementUUID}}/reopen`  |
| [GHI] Duyet va phat hanh ban thay the       | POST   | `http://localhost:3001/api/cert/replacements/{{replacementUUID}}/approve` |

### 09. Tra cuu va xac thuc cong khai

Không đăng nhập. Tra cứu tìm văn bằng theo thông tin cá nhân tối thiểu; xác thực đối chiếu bằng đã phát hành với blockchain/PDF. Không gửi proofString để test giao diện hiện tại.

| Request                          | Method | URL                                     |
| -------------------------------- | ------ | --------------------------------------- |
| Tra cuu bang thong tin toi thieu | POST   | `http://localhost:3001/api/cert/lookup` |
| Tra cuu bang day du cac truong   | POST   | `http://localhost:3001/api/cert/lookup` |
| Xac thuc UUID cua van bang       | POST   | `http://localhost:3001/api/verify`      |
| Xac thuc file PDF da ky          | POST   | `http://localhost:3001/api/verify/pdf`  |

### 10. Doi chieu blockchain va xu ly het luot thu

ADMIN/UNIVERSITY đọc/đối chiếu trong phạm vi trường; quyền thử lại kiểm tra thêm tại service. Không có thao tác xóa hoặc viết lại block.

| Request                                          | Method | URL                                                                           |
| ------------------------------------------------ | ------ | ----------------------------------------------------------------------------- |
| Tong quan ket noi Fabric                         | GET    | `http://localhost:3001/api/explorer/overview`                                 |
| Danh sach giao dich neo                          | GET    | `http://localhost:3001/api/explorer/anchors?page=1&limit=20`                  |
| Giao dich da het 10 luot thu                     | GET    | `http://localhost:3001/api/explorer/anchors?page=1&limit=20&status=EXHAUSTED` |
| Doi chieu truc tiep mot giao dich                | POST   | `http://localhost:3001/api/explorer/anchors/{{anchorId}}/check`               |
| [GHI] Yeu cau xu ly lai giao dich het luot       | POST   | `http://localhost:3001/api/explorer/anchors/{{anchorId}}/retry`               |
| Chi muc giao dich da commit theo khoi            | GET    | `http://localhost:3001/api/explorer/blocks?page=1&limit=10`                   |
| Chi tiet giao dich trong pham vi truong          | GET    | `http://localhost:3001/api/explorer/tx/{{txId}}`                              |
| Gioi han hien tai - chi tiet block chua tich hop | GET    | `http://localhost:3001/api/explorer/blocks/{{blockNumber}}`                   |

### 11. Nhat ky va kiem tra toan ven

ADMIN hoặc UNIVERSITY. Kiểm tra/resolve có thể tạo hoặc cập nhật cảnh báo, không sửa blockchain.

| Request                        | Method | URL                                                              |
| ------------------------------ | ------ | ---------------------------------------------------------------- |
| Nhat ky hoat dong              | GET    | `http://localhost:3001/api/audit?page=1&limit=20`                |
| Nhat ky mot tai khoan - admin  | GET    | `http://localhost:3001/api/audit/user/{{accountId}}`             |
| [GHI] Quet kiem tra toan ven   | POST   | `http://localhost:3001/api/integrity/check?days=1&limit=50`      |
| Canh bao chua xu ly            | GET    | `http://localhost:3001/api/integrity/alerts?resolved=false`      |
| [GHI] Xac nhan xu ly canh bao  | POST   | `http://localhost:3001/api/integrity/alerts/{{alertId}}/resolve` |
| Dem phuc vu chan doan toan ven | GET    | `http://localhost:3001/api/integrity/debug`                      |

### 12. Thao tac nhay cam - chi chon tung request

Không Run Folder/Run All. Bật allowMutations=true và allowSensitiveActions=true ngay trước một request, rồi tắt cả hai. Thu hồi/đổi mật khẩu/logout tác động dữ liệu thật và có thể vô hiệu hóa token.

| Request                                           | Method | URL                                                                 |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| [NHAY_CAM] Thu hoi van bang dang co hieu luc      | POST   | `http://localhost:3001/api/cert/revoke`                             |
| [NHAY_CAM] Refresh phien can bo                   | POST   | `http://localhost:3001/api/auth/refresh`                            |
| [NHAY_CAM] Doi mat khau cua can bo dang dang nhap | POST   | `http://localhost:3001/api/auth/change-password/{{accountId}}`      |
| [NHAY_CAM] Doi mat khau cua admin dang dang nhap  | POST   | `http://localhost:3001/api/auth/change-password/{{adminAccountId}}` |
| [NHAY_CAM] Logout phien refresh hien tai          | POST   | `http://localhost:3001/api/auth/logout`                             |
| [NHAY_CAM] Logout moi thiet bi can bo             | POST   | `http://localhost:3001/api/auth/logout-all`                         |

### 13. Chat tro ly tren web - khong phai API Fabric

Dùng webUrl localhost:3000, không dùng baseUrl localhost:3001/api. Có thể gọi dịch vụ AI tốn quota; bật cờ nhạy cảm trước. Không gửi dữ liệu cá nhân/OTP/tệp văn bằng.

| Request                                   | Method | URL                                   |
| ----------------------------------------- | ------ | ------------------------------------- |
| [NHAY_CAM] Hoi huong dan tra cuu van bang | POST   | `http://localhost:3000/api/assistant` |

## 6. Trình tự test nên dùng

1. Health → đăng nhập cán bộ → me → danh mục. Chuẩn bị MSSV/số hiệu/số vào sổ giả, duy nhất trong một môi trường thử nghiệm tách biệt.
2. Chọn **một** đường tạo hồ sơ: thủ công (students → request) hoặc Excel (preview → stage → review/recheck → commit → candidates → print-data → preview PDF → bulk/submit).
3. Chọn một hồ sơ để duyệt → chờ anchor COMMITTED → sổ văn bằng → tải PDF → tra cứu → verify UUID/PDF → explorer/check → audit.
4. Dùng hồ sơ khác để test từ chối → mở lại → sửa → trình lại → duyệt. Dùng bằng đã commit riêng để test thay thế; bằng khác nữa để test thu hồi.
5. Test retry chỉ khi đã có giao dịch hết lượt thực tế trong môi trường thử nghiệm; không cố tình cắt mạng/đổi DB đang chạy để tạo lỗi. Test mật khẩu/logout sau cùng.

## 7. Giới hạn và endpoint không dùng cho luồng mới

| Endpoint                                         | Trạng thái thực tế hiện tại                                                                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST /cert/issue                                 | Luồng cấp trực tiếp đã ngừng; service trả 403. Dùng request/import → duyệt và phát hành.                                                                                                                                                               |
| POST /cert/:uuid/sign                            | Luồng ký riêng cũ đã ngừng; không dùng cho mô hình một cán bộ.                                                                                                                                                                                         |
| POST /cert/:uuid/submit                          | **Bất nhất đang có trong code**: SubmitDiplomaDto bắt buộc issuedOn nhưng submitDraft từ chối mọi issuedOn được truyền. Body rỗng cũng không qua DTO. Dùng POST /cert/bulk/submit với một UUID như collection; không coi endpoint đơn là đã hoạt động. |
| GET /explorer/blocks/:number                     | Chủ động trả 503 “Chưa tích hợp chỉ mục khối”; chưa có API chi tiết block thật. Collection có request mong đợi 503 để phân biệt với lỗi không dự kiến.                                                                                                 |
| GET /explorer/blocks và /explorer/tx/:txId       | Đọc chỉ mục anchor PostgreSQL trong phạm vi trường, không phải trình duyệt toàn ledger.                                                                                                                                                                |
| GET /cert/search không Bearer                    | Mặc định 403 khi PUBLIC_DIRECTORY_ENABLED không bật; dùng POST /cert/lookup công khai.                                                                                                                                                                 |
| CRUD trực tiếp trường/cơ sở/quyền/quyết định/lớp | Không phải bảng nào cũng có controller CRUD riêng; không tự suy endpoint từ tên bảng. Quyết định/lớp được tạo qua nhập liệu/nghiệp vụ tương ứng.                                                                                                       |
| Xóa toàn bộ DB hoặc blockchain                   | Không có endpoint trong collection. Không xóa bảng, audit hoặc ledger để dọn test trên hệ thống hiện dùng.                                                                                                                                             |

## 8. Đọc lỗi và kết quả kiểm thử

| Kết quả                     | Cách hiểu/xử lý                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Request skipped             | Kiểm tra Console, environment đang chọn, biến trống và hai cờ an toàn. Không phải lỗi API.                                      |
| 400                         | Sai kiểu/thiếu trường/UUID/ngày; Nest bật whitelist + forbidNonWhitelisted nên không gửi trường thừa.                           |
| 401                         | JWT sai/hết hạn/bị thu hồi hoặc mật khẩu/cổng đăng nhập không khớp.                                                             |
| 403                         | Sai vai trò, không có capability/phạm vi, đổi mật khẩu hộ hoặc endpoint đã ngừng.                                               |
| 404                         | Không có bản ghi hoặc không tìm thấy trong phạm vi cho phép.                                                                    |
| 409                         | Trùng số hiệu/sổ, trạng thái không phù hợp, updatedAt/retry token cũ hoặc có người xử lý đồng thời. Tải lại trước khi thử tiếp. |
| 429                         | Quá tần suất; chờ trước khi gọi lại, nhất là login/OTP/verify/lookup.                                                           |
| 503                         | Xem message: có thể Fabric/TSA/AI chưa sẵn sàng hoặc endpoint chi tiết block chưa tích hợp.                                     |
| 2xx + failed/results có lỗi | Bulk/commit có thể thành công một phần; không chạy lại mù toàn bộ.                                                              |
| 2xx + isValid=false         | Không hợp lệ/chưa đủ điều kiện/chưa commit; đọc verificationStatus, không kết luận từ HTTP 200.                                 |

Kiểm tra offline (không gọi API, không ghi DB/ledger):

```powershell
node scripts/test-api-documentation.mjs
```

Bài test kiểm tra cấu trúc collection/environment, biến, guard, URL so với controller, body so với DTO, tài liệu đủ 27 bảng, và các giới hạn đã nêu. **Không thay thế kiểm thử tích hợp có ký PDF/giao dịch Fabric thật.**

Nguồn đối chiếu: `apps/api/src/main.ts`; controller/DTO/service trong `auth, catalog, students, imports, cert, verify, dashboard, audit, integrity, explorer`; `apps/web/src/app/api/assistant/route.ts`.
