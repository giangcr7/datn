# Nhập sổ gốc Excel

## File thực tế đã kiểm tra

`26.4 Sổ gốc Phân hiệu năm 2021.2022.2023.2024.xlsx` chứa cả 2020–2025, không chỉ 2021–2024 như tên file. Hai sheet ẩn `Sheet1` và `MSSV-2021` là nguồn đối chiếu, không nhập thành bản ghi tốt nghiệp.

| Sheet    |      Dòng | Phát hiện quan trọng                                                                   |
| -------- | --------: | -------------------------------------------------------------------------------------- |
| 2020     |       350 | Không có cột ngành; 350 dòng cần xác nhận ngành. Số văn bằng dùng cache VLOOKUP ngoài. |
| 2021     |       258 | 238 MSSV lỗi #N/A; không sửa bằng cách ghép họ tên tự động.                            |
| 2022     |       321 | MSSV thực tế ở F, không phải B. Dòng 4 thiếu STT. Có 145 ô năm chứa tên ngành.         |
| 2023     |       301 | 184 dòng đảo M/N; 115 dòng M là GPA hoặc trống, N là xếp loại. Có typo tên ngành.      |
| 2024     |       264 | Số văn bằng dùng liên kết ngoài; 23 ngày ký không hợp lệ/ở tương lai.                  |
| 2025     |       461 | 284 dòng chưa có số hiệu/số vào sổ; đó là hồ sơ tốt nghiệp chưa tạo bằng.              |
| **Tổng** | **1.955** | **483 READY, 1.472 NEEDS_REVIEW theo mapping v1**                                      |

Các số ERROR/WARNING trong report là **số issue**, không phải số sinh viên. Một dòng có thể có nhiều issue. READY có nghĩa đủ điều kiện kỹ thuật để commit hồ sơ, không phải kết luận pháp lý hoặc đã ghi blockchain.

SHA-256 file đã quét: `249b9d0d26d924eea4d6cde54c3e20ffdd5aa3ba600c529d780f259900dd49bb`.

## Các trường cần ưu tiên

- **Bắt buộc để nhập hồ sơ tốt nghiệp:** MSSV, họ tên, ngày sinh xác thực, ngành đã map, năm tốt nghiệp, xếp loại xác nhận từ sổ.
- **Bắt buộc để tạo văn bằng:** hồ sơ tốt nghiệp + số hiệu + số vào sổ.
- **Bắt buộc trước phê duyệt/anchor:** ngày cấp thực tế, người lập, người duyệt khác nhau, campus/MSP, snapshot.
- **Có thể null khi nguồn không có:** GPA, loại bằng, chuyên ngành, nơi sinh, giới tính, dân tộc, quốc tịch, cohort, signer, ngày quyết định. Không mặc định GPA=2.00 hoặc “Kỹ sư”.
- **Ít thiết yếu đối với định danh:** STT, ô ghép tên|ngày sinh, ô COUNTIF/VLOOKUP hỗ trợ, tên người nhận ký, ghi chú. Giữ trong file gốc; parser chỉ sao chép các cột nghiệp vụ hữu ích vào staging.

## CLI an toàn

Chạy từ thư mục `apps/api` để đường dẫn storage trong .env được hiểu đúng:

```powershell
npm run registry:inspect -- --file "../../26.4 Sổ gốc Phân hiệu năm 2021.2022.2023.2024.xlsx"
npm run registry:inspect -- --file "../../26.4 Sổ gốc Phân hiệu năm 2021.2022.2023.2024.xlsx" --stage
```

Mặc định chỉ preview; `--stage` chỉ lưu file/staging, **không ghi bảng nghiệp vụ**. Actor mặc định lấy email BOOTSTRAP_ORG2_EMAIL; có thể truyền `--actor-email`. Actor là cán bộ có membership đã tồn tại, không tự tạo admin.

## API

Tất cả endpoint import yêu cầu JWT cán bộ đúng campus (admin được quản lý các campus trong institution của membership).

| API                                                                 | Kết quả                                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| POST /api/imports/registry/preview                                  | Chỉ đọc; tổng hợp issue và 50 dòng đầu                                               |
| POST /api/imports/registry                                          | Lưu file checksum, batch, raw/normalized, issue; idempotent theo file/campus/mapping |
| GET /api/imports                                                    | Danh sách batch được phép xem                                                        |
| GET /api/imports/{batchId}/rows?page=1&limit=20&status=NEEDS_REVIEW | Dòng chờ rà soát                                                                     |
| PATCH /api/imports/{batchId}/rows/{rowId}                           | Corrections + note; không đổi raw/normalized gốc                                     |
| POST /api/imports/{batchId}/commit                                  | Chỉ commit dòng READY; mỗi dòng là transaction độc lập                               |
| POST /api/imports/program-aliases                                   | Phê duyệt typo/tên nguồn vào ngành đã có; cần ghi chú căn cứ                         |

Body upload: `{"fileName":"register.xlsx","fileData":"<base64>"}`. Không hỗ trợ .xls/CSV cho sổ gốc v1. File tối đa 5 MB, sau giải nén tối đa 64 MB, tối đa 6.000 dòng. Không tính lại công thức, không tải workbook ngoài, không thực thi macro.

Body review ví dụ:

```json
{
  "corrections": {
    "studentCode": "0012345678",
    "programId": "<uuid-ngành-đã-xác-nhận>"
  },
  "note": "Đối chiếu hồ sơ giấy và danh sách gốc đã ký ngày ..."
}
```

Review không dùng note để bỏ qua ERROR: giá trị mới vẫn phải qua validator và kiểm tra số trùng. Xác nhận cảnh báo cột đảo/year-from-sheet là trách nhiệm của người review. Cảnh báo NOT_YET_ISSUED được giữ và không ngăn nhập graduation-only. Alias phê duyệt mới không sửa hồi tố normalizedData; dùng override programId cho các dòng đã staging.

## Sau commit

- Không có số bằng: Student + Enrollment + GraduationRecord, không có Diploma.
- Có đủ cặp số: thêm Diploma DRAFT. **Ngày quyết định không mặc nhiên là ngày cấp**.
- Gửi bản nháp: POST /api/cert/{uuid}/submit với `{"issuedOn":"YYYY-MM-DD"}`.
- Cán bộ khác phê duyệt: POST /api/cert/approve/{uuid}. DRAFT/REQUESTED chưa có snapshot phát hành; chỉ APPROVED mới tạo snapshot + outbox.
- Worker đồng bộ Fabric sau đó; FABRIC_ENABLED=false giữ anchor chờ, không giả ON_CHAIN.

## Các việc không được tự động đoán

Không suy MSSV từ họ tên; không suy ngành từ mã lớp chưa được nhà trường phê duyệt; không suy xếp loại từ GPA; không suy ngày cấp từ ngày quyết định; không gộp tên ngành lịch sử thành ngành hiện hành khi chưa có căn cứ; không gán email giả hoặc tạo mật khẩu từ MSSV/ngày sinh.
