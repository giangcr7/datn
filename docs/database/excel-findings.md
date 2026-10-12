# Kết quả đọc sổ gốc Excel

## Phạm vi nguồn

- File: `26.4 Sổ gốc Phân hiệu năm 2021.2022.2023.2024.xlsx`, giữ nguyên không chỉnh sửa.
- SHA-256: `249b9d0d26d924eea4d6cde54c3e20ffdd5aa3ba600c529d780f259900dd49bb`.
- 1.955 dòng nghiệp vụ thực tế, gồm các sheet **2020–2025** dù tên file chỉ ghi 2021–2024.
- Các sheet ẩn `Sheet1` và `MSSV-2021` không được coi là dòng tốt nghiệp.

| Sheet | Số dòng |
| ----- | ------: |
| 2020  |     350 |
| 2021  |     258 |
| 2022  |     321 |
| 2023  |     301 |
| 2024  |     264 |
| 2025  |     461 |

Preview: **483 READY, 1.472 NEEDS_REVIEW**. Chưa stage, chưa commit và chưa phát hành văn bằng từ file thật. Báo cáo máy đọc được: `reports/database/registry-preview.json`; không chứa danh sách PII.

## Trường quan trọng để thiết kế

| Nhóm       | Trường nguồn                                    | Lưu trong CSDL                                                  | Quy tắc                                                                                   |
| ---------- | ----------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Người học  | MSSV                                            | `students.student_code`                                         | Chuỗi, giữ số 0 đầu; unique theo trường, không làm PK                                     |
| Người học  | Họ + tên                                        | `students.full_name`                                            | Bắt buộc; MSSV có sẵn phải đối chiếu họ tên                                               |
| Nhân thân  | Ngày sinh                                       | `students.date_of_birth`                                        | Import yêu cầu xác nhận; schema cho phép null để quản lý hồ sơ chưa đầy đủ                |
| Nhân thân  | Nơi sinh, giới tính, dân tộc, quốc tịch         | Các cột riêng trong `students`                                  | Có thể null, không bịa giá trị mặc định                                                   |
| Đào tạo    | Ngành/chương trình                              | `programs` + `program_aliases`                                  | Ánh xạ UUID danh mục; không gộp tên ngành lịch sử nếu chưa có căn cứ                      |
| Đào tạo    | Lớp, khóa                                       | `academic_classes` + `enrollments`                              | Giữ quá trình học theo campus/chương trình; không suy ngành từ lớp                        |
| Tốt nghiệp | Năm tốt nghiệp                                  | `graduation_records.graduation_year`                            | Định danh duy nhất sinh viên/ngành/năm, có review khi lấy từ tên sheet                    |
| Tốt nghiệp | GPA, thang điểm                                 | `graduation_records.gpa, gpa_scale`                             | Decimal; null khác 0; GPA không có trong nguồn thì không tự tính                          |
| Tốt nghiệp | Xếp loại                                        | `graduation_records.classification`                             | Giá trị độc lập được xác nhận, không suy từ GPA                                           |
| Quyết định | Số quyết định, ngày ký, người ký                | `graduation_decisions`                                          | Một quyết định dùng chung nhiều hồ sơ; ngày ký không phải ngày cấp                        |
| Văn bằng   | Số hiệu, số vào sổ                              | `diplomas.certificate_no, registry_no`                          | Có đủ cả hai mới tạo Diploma; unique theo institution                                     |
| Văn bằng   | Ngày cấp thực tế                                | `diplomas.issued_on`                                            | Bắt buộc trước submit/approve; không dùng ngày hiện tại hoặc ngày quyết định để lấp thiếu |
| Nguồn      | File/sheet/dòng, STT, công thức/cache, cảnh báo | `source_documents/import_batches/import_rows/validation_issues` | Truy vết nguồn bất biến; correction nằm trong overrides có audit                          |

Các trường sinh thêm bởi hệ thống như UUID, actor, timestamps, workflow, snapshot version/hash, transaction ID không được suy từ STT Excel.

## Trường ít thiết yếu / không dùng làm khóa

- **STT:** chỉ là thứ tự trình bày; thiếu STT vẫn phải giữ dòng có dữ liệu nghiệp vụ.
- **Định dạng, màu, merged cells:** không đưa vào business tables.
- **Công thức/cached results:** giữ trong raw source để kiểm chứng, không thực thi công thức hoặc tải workbook ngoài.
- **Giá trị lặp tên ngành/nhãn cơ sở:** danh mục + FK thay vì nhiều chuỗi tự do.
- **Email, mật khẩu:** file này không đủ cơ sở tạo tài khoản; không gán email giả hoặc password từ MSSV/ngày sinh.

## Vấn đề dữ liệu cần đối chiếu

Số lượng dưới đây là **số issue**, không cộng lại thành số sinh viên vì một dòng có nhiều issue.

| Issue                                     | Số lượng |
| ----------------------------------------- | -------: |
| Cache công thức tham chiếu workbook ngoài |    1.452 |
| Ngành chưa ánh xạ                         |      368 |
| Lỗi Excel                                 |      250 |
| MSSV không hợp lệ                         |      241 |
| Chưa có cả hai số văn bằng                |      293 |
| Thiếu STT                                 |        1 |
| 2022: MSSV ở F nhưng header B sai         |      321 |
| Gợi ý năm từ tên sheet                    |      260 |
| Cột năm/xếp loại bị đảo                   |      184 |
| Cột GPA cần realignment                   |      115 |
| MSSV lặp giữa các sheet                   |   2 dòng |
| Ngày ký/cấp không hợp lệ hoặc tương lai   |       23 |

2020 có 350 dòng thiếu ngành. 2021 có 238 MSSV cache `#N/A`. 2023 có đoạn cột M/N đảo hoặc M chứa GPA/N chứa xếp loại; parser giữ riêng cả hai và yêu cầu review mapping. 2025 có 284 dòng chỉ mang cảnh báo chưa cấp số văn bằng; có thể lưu kết quả tốt nghiệp nếu hợp lệ, không tạo văn bằng giả định.

## Quyết định lưu trữ

1. Giữ file gốc theo key riêng `institutionId/sha256.xlsx` trong private storage.
2. Tách raw/normalized/issue với override, note, actor và thời điểm review.
3. Commit từng dòng READY bằng transaction. Thiếu cặp số thì chỉ lưu Student/Enrollment/GraduationRecord; có cặp số thì tạo Diploma DRAFT.
4. Bản nháp chỉ được gửi duyệt khi ngày cấp đã xác nhận. Người khác phê duyệt tạo snapshot bất biến và outbox; Fabric chỉ nhận hash.
