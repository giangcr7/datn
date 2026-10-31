# Bộ dữ liệu kiểm thử lần 2

Có **16 file Excel, tổng cộng 41 hồ sơ**, mỗi file 2–3 dòng như bộ lần 1.
Bộ lần 1 ở thư mục cha được giữ nguyên. Chọn từng file theo tình huống, không nhập cả thư mục cùng lúc.

## Điểm khác so với lần 1

- Lấy dữ liệu từ **26.4 Sổ gốc - DEMO đầy đủ thông tin.xlsx**, sheet **2025**, các dòng nguồn **11, 12, 13**; bộ lần 1 dùng dòng 8, 9, 10. Không chỉnh sửa file nguồn.
- Giữ họ tên, ngày sinh, lớp, ngành, xếp loại, năm tốt nghiệp, GPA, quyết định và thông tin in từ các hồ sơ nguồn mới. Những trường thiếu/sai được chủ động thay riêng cho từng ca kiểm thử.
- MSSV chuẩn: **98 + mã ca 2 số + số thứ tự 6 số**, ví dụ **9801000001**. Số hiệu **TEST2-01-001**, số vào sổ **TEST2/01/001**. Các mã này tách biệt với bộ lần 1, không cần xóa dữ liệu lần 1 để dùng bộ mới.
- Ba ngành nguồn: **Kỹ thuật tài nguyên nước**, **Kỹ thuật công trình xây dựng**, **Kỹ thuật xây dựng công trình giao thông**. Kiểm tra danh mục/ánh xạ của ba tên này trước khi nhập; ca 03 cố ý dùng một tên chưa ánh xạ khác với lần 1.
- Giữ đúng mẫu nhập 28 cột: A–Y từ nguồn, GPA hệ 4 lấy cột AD, chuyên ngành lấy cột AE. Cột “Người ký quyết định TN” để trống vì nguồn không có cột riêng; không lấy người ký văn bằng thay người ký quyết định.
- Các ngày hợp lệ được giữ dưới dạng ngày Excel, hiển thị **dd/mm/yyyy**; không đổi năm tốt nghiệp theo ngày hiện tại. Sheet **2025** là tên mẫu mà bộ nhập hỗ trợ.

## Danh sách tình huống

| File                                    | Số dòng | Kiểm tra / kết quả mong đợi                                                                 |
| --------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| 01_hop_le.xlsx                          | 3       | Nhập, lưu, duyệt và phát hành; không có lỗi dữ liệu nếu danh mục đã ánh xạ.                 |
| 02_thieu_bat_buoc.xlsx                  | 3       | MSSV sai định dạng; thiếu họ tên; thiếu ngày sinh.                                          |
| 03_nganh_chua_anh_xa.xlsx               | 2       | Một dòng có tên ngành chưa được phê duyệt ánh xạ; một dòng đối chứng.                       |
| 04_ngay_khong_hop_le.xlsx               | 3       | Ngày cấp tương lai; ngày cấp trước năm tốt nghiệp; ngày quyết định tương lai.               |
| 05_diem_va_xep_loai.xlsx                | 3       | GPA vượt thang 4; xếp loại không hợp lệ; GPA âm.                                            |
| 06_thieu_thong_tin_in_bang.xlsx         | 3       | Thiếu ngày cấp; thiếu loại bằng; thiếu người ký trên bằng.                                  |
| 07_trung_mssv.xlsx                      | 3       | Hai dòng đầu trùng MSSV; dòng thứ ba đối chứng.                                             |
| 08_trung_so_hieu.xlsx                   | 3       | Hai dòng đầu trùng số hiệu văn bằng.                                                        |
| 09_trung_so_vao_so.xlsx                 | 3       | Hai dòng đầu trùng số vào sổ.                                                               |
| 10_du_lieu_nen_trung_csdl.xlsx          | 2       | Nhập và lưu làm nền trước khi test file 11 của chính bộ lần 2.                              |
| 11_trung_csdl.xlsx                      | 3       | Trùng cả số hiệu/sổ, chỉ số hiệu, chỉ số vào sổ với file 10 lần 2.                          |
| 12_tu_choi_va_bo_sung.xlsx              | 2       | Từ chối, mở lại, bổ sung, trình lại và duyệt.                                               |
| 13_sua_sai_va_thay_the.xlsx             | 2       | Phát hành bản gốc, sửa sai bằng hồ sơ thay thế, kiểm tra liên kết và trạng thái.            |
| 14_thu_hoi.xlsx                         | 2       | Phát hành, thu hồi, kiểm tra sổ và xác thực không còn hiệu lực.                             |
| 15_doi_chieu_va_thu_lai_blockchain.xlsx | 2       | Đối chiếu giao dịch; thử lại chỉ khi có giao dịch đủ điều kiện trong môi trường test riêng. |
| 16_tra_cuu_va_xac_thuc.xlsx             | 2       | Phát hành, tra cứu thông tin trong file, tải PDF rồi xác thực PDF/QR.                       |

## Cách chạy lần 2

1. Đăng nhập cán bộ nhà trường tại cơ sở chính, có quyền nhập và duyệt. Dùng môi trường kiểm thử riêng.
2. Vào **Hồ sơ cấp văn bằng → nhập Excel/kiểm tra dữ liệu**, chọn file trong **test/lan-2**. Hàng 1 là tiêu đề, hàng 2–4 là dữ liệu.
3. Bắt đầu bằng file **01_hop_le.xlsx**. Các ca 02–09 phải hiện đúng lỗi trước khi sửa; không coi đó là lỗi phần mềm.
4. Với trùng CSDL, **phải lưu file 10 của lần 2 thành hồ sơ có số hiệu/sổ trước khi nhập file 11 lần 2**. File 10 lần 1 không thay thế được bước này. Chỉ staging/preview file 10 chưa đủ.
5. Các file 12–16 có dữ liệu hợp lệ để anh thao tác nghiệp vụ trên giao diện. Chờ giao dịch blockchain hoàn tất trước khi xác thực kết quả cuối.

Chi tiết cách thực hiện các ca từ chối/thay thế/thu hồi/đối chiếu/tra cứu giống [hướng dẫn bộ lần 1](../README.md).
Không dùng lại số hiệu/sổ cũ cho bản thay thế. Không sửa trực tiếp PDF đã ký, không xóa audit/ledger hoặc dữ liệu lần 1.
Excel không tự tạo được sự cố Fabric, lỗi CA/TSA hay giao dịch đã hết lượt thử. Bộ file không phải bằng chứng đã chạy thành công các nghiệp vụ blockchain thật.

## Kiểm tra lại không ghi CSDL/blockchain

Tại thư mục gốc dự án:

    node scripts/test-manual-fixtures.mjs test/lan-2/cases.json

Lệnh dùng bộ nhập thực tế để kiểm tra đúng số dòng, mã lỗi, vị trí trùng; đối chiếu nguồn theo từng cột và kiểm tra định danh không trùng bộ lần 1. Trùng CSDL được mô phỏng bằng dữ liệu trong bộ nhớ.

Các workbook chứa thông tin từ nguồn nên **chỉ giữ cục bộ**, đã được quy tắc \*.xlsx bỏ qua. Không ép đưa workbook lên GitHub. Chỉ hướng dẫn, cấu hình ca và mã kiểm tra không chứa hồ sơ cá nhân được commit.
