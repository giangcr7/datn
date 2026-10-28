# Kiểm tra dữ liệu và gửi yêu cầu cấp văn bằng

## File dùng cho từng chức năng

| Chức năng | File / dữ liệu dùng |
| --- | --- |
| Hồ sơ sinh viên > Nhập hồ sơ sinh viên | `outputs/retest-20261025/Ho so sinh vien - DEMO import.xlsx`; mẫu riêng với MSSV, họ tên và email |
| Kiểm tra dữ liệu | `26.4 Sổ gốc - DEMO đầy đủ thông tin.xlsx` |
| Yêu cầu cấp phát và ghi nhận văn bằng | Chọn các hồ sơ đã kiểm tra và lưu; không nhập lại Excel |
| Trụ sở phê duyệt văn bằng | Chọn yêu cầu cơ sở đã ký và gửi; không nhập Excel |
| Văn bằng toàn trường | Xem văn bằng đã phát hành; không nhập Excel |
| Xác thực | PDF đã phát hành hoặc mã / thông tin tra cứu của văn bằng |

Các đường dẫn file tính từ thư mục dự án. Không dùng file sổ văn bằng thay cho mẫu nhập hồ sơ sinh viên. Nhập hồ sơ sinh viên không đồng nghĩa đã cấp bằng và không ghi blockchain.

## Luồng thao tác

1. Cơ sở vào **Kiểm tra dữ liệu**, chọn file và nhập để kiểm tra. Bước này lưu nguồn và danh sách lỗi, chưa cấp bằng.
2. Dòng thiếu hoặc sai thông tin: bấm **Bổ sung** ngay tại đây. Điền theo hồ sơ đối chiếu và ghi rõ căn cứ. Chỉ dòng đủ dữ liệu mới chuyển sang **Đủ thông tin, chờ lưu**.
3. Chọn **Thêm mới** hoặc **Số hóa dữ liệu**, sau đó **Lưu hồ sơ hợp lệ**. Cả hai lựa chọn đều tạo hồ sơ nháp chưa ký, chưa gửi; không mặc định là bằng đã cấp.
4. Bấm **Sang gửi yêu cầu**, chọn hồ sơ rồi ký cơ sở và gửi. Hồ sơ đã lưu đủ thông tin không phải bổ sung lại ở màn hình này.
5. Trụ sở kiểm tra độc lập, ký phát hành và phê duyệt. Chữ ký của cơ sở, chữ ký của trụ sở và bằng chứng thời gian được xử lý theo cấu hình ký PDF.
6. Khi giao dịch blockchain được xác nhận, văn bằng mới hoàn tất phát hành và dùng để xác thực. Không coi trạng thái nháp hoặc chỉ mới gửi yêu cầu là bằng đã cấp.

## Dữ liệu kiểm tra trước khi lưu

- MSSV, họ tên, ngày sinh, ngành đã ánh xạ, năm tốt nghiệp, xếp loại.
- Loại bằng; số hiệu và số vào sổ.
- Ngày cấp in trên bằng, nơi cấp, tên ngành tiếng Anh, người ký trên bằng và chức danh người ký.
- Họ tên trang tiếng Anh được đọc nếu có; khi để trống, hệ thống dùng bản chuyển tự từ họ tên đã xác nhận.
- Các trường hỗ trợ có trong file được đọc và có ô đối soát: nơi sinh, giới tính, dân tộc, quốc tịch, lớp, khóa học, GPA, chuyên ngành, số/ngày quyết định và người ký quyết định.
- Tên trường tiếng Anh phải có trong danh mục trường; không cho Excel tự thay thế tên đơn vị phát hành.
- Kiểm tra ngày hợp lệ, giới hạn độ dài và các xung đột số văn bằng. Trùng định danh hoặc khác thông tin với dữ liệu hiện có vẫn cần đối soát, không tự sửa cho qua.

Ngày cấp trên bằng độc lập với ngày ký quyết định. Người ký trên bằng độc lập với người ký quyết định. Không tự lấy giá trị của trường này thay cho trường kia.

## Hồ sơ nháp từ bản import cũ

Liên kết **Kiểm tra dữ liệu** tại hồ sơ dẫn về đúng đợt và dòng nguồn. Chỉ hồ sơ nháp chưa ký, chưa gửi mới được bổ sung; hồ sơ đã ký, đã gửi hoặc đã phát hành được khóa.

Chức năng kiểm tra lại có thể đọc nguồn Excel đã lưu và xác minh checksum để khôi phục các trường in bằng bị parser cũ bỏ sót. Dữ liệu bổ sung được lưu riêng có nhật ký; không thay đổi file, raw data hoặc normalized data ban đầu; không ghi đè giá trị đã xác nhận. Công cụ vận hành `scripts/repair-registry-print-data.mjs` mặc định chỉ xem trước; `--apply` sao lưu trước khi sửa.

## Nạp phiên bản mới

Nếu API/Web đang chạy từ bản build cũ, dừng đúng phiên dự án rồi chạy lại `.\start.ps1` trong thư mục dự án. Không reset database hoặc blockchain để áp dụng thay đổi này.

