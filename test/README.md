# Bộ dữ liệu kiểm thử thủ công

Thư mục này có **16 file Excel, tổng cộng 41 hồ sơ**, mỗi file chỉ 2–3 dòng sinh viên. Dùng từng file để thử đúng một nhóm tình huống, không nhập cả thư mục cùng lúc.

## Bộ kiểm thử lần 2

Bộ mới nằm trong [lan-2](./lan-2/README.md): 16 file, mỗi file 2–3 dòng, lấy hồ sơ khác từ nguồn và dùng MSSV/số hiệu/số vào sổ riêng. Bộ lần 1 trong thư mục này được giữ nguyên; không cần xóa dữ liệu lần 1 để dùng bộ mới.

Kiểm tra riêng bộ lần 2 bằng `node scripts/test-manual-fixtures.mjs test/lan-2/cases.json`.

## Cách sử dụng

1. Dùng môi trường kiểm thử riêng, đăng nhập tài khoản **Nhà trường/cán bộ có quyền nhập và duyệt**. Tài khoản Admin không thay người duyệt.
2. Vào **Hồ sơ cấp văn bằng**, mở chức năng nhập sổ gốc Excel/kiểm tra dữ liệu, chọn một file bên dưới.
3. Đối chiếu lỗi, vị trí trùng và kết quả mong đợi trước khi lưu. Trong tất cả file, hàng 1 là tiêu đề, hàng 2–4 là dữ liệu, sheet tên **2025**.
4. Các ca nghiệp vụ 12–16 cần thực hiện thêm thao tác trên giao diện. File Excel chỉ chuẩn bị hồ sơ đầu vào, không tự tạo trạng thái từ chối, thu hồi hay lỗi blockchain.

**Lưu ý dữ liệu:** giữ nguyên danh mục ngành và ánh xạ hiện có. Hai ngành **Kỹ thuật xây dựng** và **Kế toán** phải được ánh xạ trong danh mục được phê duyệt (đã có trong danh mục khởi tạo của dự án). Không nhập các file này vào dữ liệu thật nếu không muốn lưu hồ sơ kiểm thử. Nhập lại cùng file sau khi đã lưu sẽ phát sinh trùng CSDL ngoài mục tiêu ban đầu.

## Danh sách file và kết quả mong đợi

| File                                    | Số hồ sơ | Nội dung cần kiểm tra                                                                                            |
| --------------------------------------- | -------: | ---------------------------------------------------------------------------------------------------------------- |
| 01_hop_le.xlsx                          |        3 | Không có lỗi dữ liệu; dùng thử nhập, kiểm tra, lưu hồ sơ, duyệt và phát hành.                                    |
| 02_thieu_bat_buoc.xlsx                  |        3 | B2: MSSV chỉ có 3 số. C3/D3: thiếu họ tên. E4: thiếu ngày sinh. Mỗi dòng phải báo đúng trường sai.               |
| 03_nganh_chua_anh_xa.xlsx               |        2 | L2: ngành chưa có ánh xạ, cần rà soát. Dòng 3 hợp lệ để đối chứng.                                               |
| 04_ngay_khong_hop_le.xlsx               |        3 | T2: ngày cấp năm 2099. T3: ngày cấp trước năm tốt nghiệp. R4: ngày quyết định năm 2099.                          |
| 05_diem_va_xep_loai.xlsx                |        3 | Z2: GPA 5 trên thang 4. M3: xếp loại không thuộc danh mục. Z4: GPA âm.                                           |
| 06_thieu_thong_tin_in_bang.xlsx         |        3 | T2: thiếu ngày cấp. S3: thiếu loại bằng. V4: thiếu người ký trên bằng.                                           |
| 07_trung_mssv.xlsx                      |        3 | B2 và B3 trùng MSSV; phải chỉ rõ hai dòng và có chức năng đối chiếu. Dòng 4 không trùng.                         |
| 08_trung_so_hieu.xlsx                   |        3 | P2 và P3 trùng số hiệu văn bằng; phải chỉ rõ hai dòng. Dòng 4 không trùng.                                       |
| 09_trung_so_vao_so.xlsx                 |        3 | O2 và O3 trùng số vào sổ; phải chỉ rõ hai dòng. Dòng 4 không trùng.                                              |
| 10_du_lieu_nen_trung_csdl.xlsx          |        2 | Dữ liệu hợp lệ để lưu trước, làm nền cho file 11.                                                                |
| 11_trung_csdl.xlsx                      |        3 | Sau khi lưu file 10: dòng 2 trùng cả số hiệu và số vào sổ; dòng 3 chỉ trùng số hiệu; dòng 4 chỉ trùng số vào sổ. |
| 12_tu_choi_va_bo_sung.xlsx              |        2 | Đầu vào hợp lệ cho luồng từ chối, bổ sung, gửi lại và duyệt.                                                     |
| 13_sua_sai_va_thay_the.xlsx             |        2 | Đầu vào hợp lệ để phát hành bản gốc, sau đó sửa sai bằng chức năng phát hành thay thế.                           |
| 14_thu_hoi.xlsx                         |        2 | Đầu vào hợp lệ để phát hành, thu hồi và xác thực lại trạng thái.                                                 |
| 15_doi_chieu_va_thu_lai_blockchain.xlsx |        2 | Đầu vào hợp lệ để đối chiếu giao dịch. Thử lại cần giao dịch lỗi được chuẩn bị riêng trong môi trường kiểm thử.  |
| 16_tra_cuu_va_xac_thuc.xlsx             |        2 | Đầu vào hợp lệ để phát hành, tra cứu theo thông tin trong file, kiểm tra PDF/QR.                                 |

## Trình tự cho các ca nghiệp vụ

### Trùng với dữ liệu đã lưu: file 10 rồi file 11

- Nhập file 10, kiểm tra và **lưu thành hồ sơ có số hiệu/số vào sổ trong hệ thống**. Chỉ tải file vào vùng chờ kiểm tra là chưa đủ làm nền trùng văn bằng đã lưu.
- Nhập file 11. Mở đối chiếu tại từng lỗi: hiển thị giá trị trùng, hồ sơ đã lưu, tên file/sheet/dòng nếu dữ liệu nguồn có sẵn và các thông tin so sánh được phép xem.
- Không lưu thêm bản văn bằng có cùng số hiệu/số vào sổ. MSSV giữa hai file khác nhau có chủ đích để cô lập lỗi trùng số văn bằng.
- Nếu chưa lưu file 10, file 11 phải qua kiểm tra nội bộ file. Không có lỗi trùng CSDL lúc này là bình thường.

### Từ chối và bổ sung: file 12

1. Nhập, kiểm tra, lưu hồ sơ và chuyển sang bước duyệt theo mô hình một cơ sở, một cán bộ.
2. Từ chối một hồ sơ, nhập lý do cụ thể. Kiểm tra trạng thái và lý do đã lưu.
3. Mở lại hồ sơ bị từ chối để bổ sung trường được phép sửa, lưu và gửi lại.
4. Duyệt lại, kiểm tra hồ sơ không còn mắc kẹt ở trạng thái từ chối và nhật ký giữ được các thao tác trước đó.

### Sửa sai và phát hành thay thế: file 13

1. Nhập, duyệt và phát hành bản gốc, chờ giao dịch được xác nhận trước khi kiểm tra trạng thái cuối.
2. Từ **Sổ văn bằng**, dùng chức năng sửa sai/phát hành thay thế; ghi lý do và sửa một thông tin được phép, chẳng hạn nơi sinh bị ghi nhầm.
3. Cấp số hiệu/số vào sổ mới nếu giao diện yêu cầu. Không nhập lại file Excel để giả lập thay thế và không sửa trực tiếp PDF đã ký.
4. Kiểm tra liên kết bản gốc–bản thay thế, lịch sử và trạng thái xác thực của cả hai bản. Bản gốc phải thể hiện đã được thay thế, không tiếp tục được trình bày như bản hiện hành.

### Thu hồi: file 14

1. Nhập, duyệt, phát hành và chờ giao dịch được xác nhận.
2. Thu hồi một văn bằng, ghi lý do. Đợi hoàn tất giao dịch thu hồi.
3. Kiểm tra **Sổ văn bằng**, **Nhật ký hoạt động**, **Đối chiếu blockchain** và trang xác thực. Văn bằng thu hồi không được trả về như văn bằng còn hiệu lực.

### Đối chiếu và thử lại: file 15

1. Phát hành hồ sơ và mở **Đối chiếu blockchain** để so sánh mã giao dịch, trạng thái chờ/hoàn tất, dữ liệu liên quan trong hệ thống.
2. Chỉ thử thao tác khôi phục khi có giao dịch lỗi hoặc hết lượt thử lại trong **mạng/môi trường kiểm thử riêng** được chuẩn bị cho mục đích này.
3. Kiểm tra quyền thử lại, yêu cầu ghi lý do nếu có, nhật ký, kết quả xử lý và khả năng ngăn gửi lặp giao dịch đang chạy/đã thành công.

**Giới hạn:** Excel không thể tự tạo lỗi kết nối Fabric, lỗi CA/TSA/OCSP hoặc giao dịch đã hết lượt thử lại. Không tắt mạng blockchain đang dùng, xóa ledger hay chỉnh DB thật chỉ để ép lỗi. Bộ file này chưa chứng minh các luồng giao dịch đã được chạy thành công.

### Tra cứu và xác thực: file 16

1. Phát hành hồ sơ và đợi trạng thái giao dịch cuối cùng.
2. Ở trang tra cứu, nhập đúng **họ tên và ngày sinh** (hai trường bắt buộc). Điền thêm MSSV, số hiệu/số vào sổ hoặc các thông tin đào tạo trong file để thử lọc chi tiết.
3. Tải PDF do hệ thống phát hành để xác thực và quét QR từ chính PDF đó. Không có PDF đã ký được tạo sẵn trong thư mục này.
4. Thử nhập sai một giá trị tra cứu để kiểm tra không khớp. Nếu thử PDF bị sửa, chỉ sửa một bản sao dùng để kiểm thử, giữ nguyên bản đã ký và xóa bản sao sau khi xong.

## Nguồn và các giá trị đã thay đổi

- Nguồn: **26.4 Sổ gốc - DEMO đầy đủ thông tin.xlsx**, sheet **2025**, ba dòng gốc **8, 9, 10**. File nguồn không bị chỉnh sửa.
- Giữ các thông tin sinh viên và thông tin in bằng từ nguồn, lấy tối đa ba hồ sơ đầu cho từng ca. Chỉ lấy 28 cột cần nhập, bỏ các cột theo dõi phụ.
- Gán lại STT từ 1. MSSV chuẩn có cấu trúc **99 + mã ca 2 số + số thứ tự 6 số** (10 chữ số). Số hiệu dạng **TEST-01-001**, số vào sổ dạng **TEST/01/001**. Đây là định danh kiểm thử, không phải số văn bằng thật.
- Các ca trùng chủ động sao chép đúng trường cần kiểm tra. Những ca khác có bộ mã riêng để tránh lỗi trùng ngoài ý muốn. Ngày được lưu dưới dạng ngày Excel, hiển thị **dd/mm/yyyy**; các ngày sai trong file 04 là có chủ đích.
- File Excel vẫn chứa thông tin cá nhân từ nguồn nên **chỉ giữ cục bộ**, được Git bỏ qua theo quy tắc \*.xlsx. Không ép thêm chúng vào GitHub bằng tùy chọn force. Hướng dẫn, mô tả ca và mã kiểm tra không chứa bản ghi cá nhân thì được quản lý bằng Git.

## Kiểm tra lại bộ file

Tại thư mục gốc dự án, chạy:

    node scripts/test-manual-fixtures.mjs

Lệnh dùng bộ đọc/kiểm tra nhập sổ gốc thực tế từ mã nguồn để xác nhận số dòng, từng mã lỗi và vị trí trùng. Ca trùng CSDL được đối chiếu với bản ghi nền **trong bộ nhớ**. Không kết nối CSDL, không phát hành PDF và không gửi giao dịch blockchain.

Mô tả máy đọc nằm ở **test/cases.json**. Khi sao chép dự án từ GitHub, phải tự chuyển bộ Excel cục bộ này sang máy kiểm thử trước khi chạy lệnh.
