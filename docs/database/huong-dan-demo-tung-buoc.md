# Hướng dẫn demo từng bước trên phiên bản hiện tại

Ngày chuẩn bị: 15/10/2026. Chỉ áp dụng cho local hoặc database kiểm thử.

> Luồng import trong tài liệu này dùng fixture cũ. Với phiên bản hiện tại, xem [Kiểm tra dữ liệu và gửi yêu cầu cấp văn bằng](kiem-tra-du-lieu-gui-cap-bang.md). Tất cả trường phục vụ gửi duyệt/in bằng phải được bổ sung tại Kiểm tra dữ liệu trước khi lưu; không làm theo bước chọn ngày cấp sau commit ở mục 8 bên dưới.

## Demo ngắn nên làm trước

Luồng chính: **HCM tạo sinh viên → HCM lập yêu cầu → Hà Nội duyệt → Fabric commit → ON_CHAIN → VERIFIED**. Admin không phải người duyệt.

| Bước | Đăng nhập / trang | Thao tác và kết quả cần thấy |
| --- | --- | --- |
| 1 | Chưa đăng nhập | Mở Web cổng 3000; health API cổng 3001 phải báo database up, Fabric connected=true |
| 2 | HCM, /students/import | Chọn outputs/demo-20261015/01-sinh-vien-demo.xlsx nếu chưa nhập; 4 MSSV của bộ này hiện đã có, có thể bỏ qua và tiếp tục lập yêu cầu |
| 3 | HCM, /issue | Nhập ca phê duyệt ở mục 9, bấm Lưu và gửi phê duyệt; văn bằng ở hàng chờ, chưa lên blockchain |
| 4 | HCM, /pending | Xem được yêu cầu, không có nút Duyệt/Từ chối |
| 5 | Hà Nội, /pending | Mở Phê duyệt tại trụ sở, xem hồ sơ nguồn HCM, bấm Duyệt và xác nhận |
| 6 | Hà Nội, /certificates | Tải lại sau khi worker chạy: ANCHOR_PENDING → ON_CHAIN; có transaction ID thật |
| 7 | Hà Nội rồi trang công khai /verify | Bấm Verify, sau đó Copy Proof và dán vào trang xác thực: VERIFIED, isValid=true |
| 8 | HCM rồi Hà Nội | Lập ca từ chối ở mục 9, Hà Nội từ chối kèm lý do: REJECTED, không có giao dịch phát hành |
| 9 | Hà Nội, làm cuối | Thu hồi văn bằng giả đã on-chain; sau giao dịch thu hồi commit, xác thực là REVOKED, isValid=false |
| 10 | Admin | Xem tài khoản và Audit; không có quyền duyệt/thu hồi nghiệp vụ |

Demo mở rộng import sổ gốc: làm mục 6–8 bằng 02-so-goc-demo.xlsx, sửa lỗi giả có ghi chú, commit thành nháp rồi gửi Hà Nội duyệt. File sổ thật chỉ preview theo mục 5, không commit dữ liệu thật.

## 0. Những điều cần biết trước khi test

- Web: http://localhost:3000. Swagger: http://localhost:3001/docs.
- HCM lập hồ sơ, Hà Nội duyệt độc lập và phát hành lên Fabric. Admin chỉ quản trị/audit, không duyệt thay.
- Khi Fabric bật đúng cấu hình, sau worker commit trạng thái chuyển từ ANCHOR_PENDING sang ON_CHAIN; nếu Fabric tắt thì dừng ở ANCHOR_PENDING là đúng.
- Các bước import sinh viên, staging, commit, lập yêu cầu, phê duyệt và thu hồi đều ghi vào database đang kết nối. Không tự rollback khi anh bấm trên Web.
- File sổ thật chỉ dùng preview. Không commit hàng loạt dữ liệu thật để demo.
- Import sổ hiện còn có nhánh tạo sinh viên còn thiếu. Bộ demo này tạo sinh viên trước; không dùng demo để khẳng định đã có kiểm tra bắt buộc sinh viên tồn tại trước mọi lần import.
- Giao diện còn dùng chung khung quản trị, nhưng đã tách nhãn vai trò, menu tài khoản và quyền duyệt/thu hồi: HCM lập hồ sơ, Hà Nội phê duyệt, admin quản trị. Đây không phải ba ứng dụng độc lập.

## 1. File và tài khoản cần chuẩn bị

Hai file đã được chuẩn bị sẵn trong D:\datn\diplomachain\outputs\demo-20261015:

| File | Dùng ở đâu | Nội dung |
| --- | --- | --- |
| 01-sinh-vien-demo.xlsx | Quản lý sinh viên > Import sinh viên (Excel) | 4 sinh viên giả, đúng 3 cột MSSV, Họ và tên, Email |
| 02-so-goc-demo.xlsx | Quản lý văn bằng > Import văn bằng (Excel) | Sheet 2025, 2 hồ sơ giả; 1 dòng hợp lệ và 1 dòng chủ động sai MSSV để tập rà soát |

Hai file Excel chỉ lưu local và đang nằm trong quy tắc gitignore. Không sửa/ghi đè file sổ thật. Không đổi tên sheet hoặc thêm dòng tiêu đề phía trên hàng 1 của file sổ demo.

| Tài khoản | Email | Mật khẩu |
| --- | --- | --- |
| Người lập HCM | university.hcm@example.com | BOOTSTRAP_ORG2_PASSWORD trong apps/api/.env; nếu đã đổi thì dùng mật khẩu mới |
| Người duyệt/phát hành Hà Nội | university.hanoi@example.com | BOOTSTRAP_ORG1_PASSWORD trong apps/api/.env; nếu đã đổi thì dùng mật khẩu mới |
| Quản trị hệ thống, không duyệt | admin@example.com | BOOTSTRAP_ADMIN_PASSWORD trong apps/api/.env; nếu đã đổi thì dùng mật khẩu mới |

Không đưa mật khẩu local vào báo cáo, ảnh chụp hoặc GitHub. Sinh viên chưa có mật khẩu mặc định; các email example.com trong bộ demo không dùng để nhận OTP.

Đăng nhập bị giới hạn 5 lần/phút theo IP. Nếu đổi qua lại các vai trò quá nhanh và gặp quá nhiều yêu cầu, đợi khoảng 60 giây rồi thử lại; không đổi/reset mật khẩu chỉ vì bị giới hạn tạm thời. Không chạy đồng thời bộ Web smoke và E2E Fabric trên cùng API.

| MSSV giả | Họ tên đúng | Mục đích |
| --- | --- | --- |
| 0099999992 | Sinh viên Demo Phê duyệt | Lập yêu cầu bằng tay, phê duyệt, xác thực trạng thái và thu hồi |
| 0099999993 | Sinh viên Demo Từ chối | Lập yêu cầu riêng để từ chối |
| 0099999994 | Sinh viên Demo Import | Dòng hợp lệ trong sổ demo |
| 0099999995 | Sinh viên Demo Rà soát | Dòng lỗi trong sổ demo; MSSV đúng được quy định ở bảng này |

Kiểm tra lại ngày 15/10/2026: cả bốn MSSV 0099999992–0099999995 đã tồn tại; văn bằng DEMO-20261015-IMP-01 đang REQUESTED/chờ duyệt. Anh có thể bỏ qua nhập sinh viên và đi thẳng mục 9 để lập hai ca REQ-01/REQ-02 nếu chưa tạo, hoặc để Hà Nội duyệt bản IMP-01 đã gửi. Không tạo lại bản ghi chỉ vì đã chạy lại hướng dẫn. MSSV 0099999991 thuộc ca cũ, không dùng lại. Nếu cần bộ mới, đổi đồng bộ MSSV/email/số hiệu/số vào sổ ở mọi nơi; không chỉ đổi tên file và không xóa database.

## 2. Mở chương trình

Nếu Web đã mở được thì bỏ qua lệnh khởi động, không chạy thêm một phiên trùng cổng.

Nếu chưa chạy: mở Docker Desktop, đợi engine sẵn sàng; mở PowerShell và chạy:

~~~powershell
cd D:\datn\diplomachain
powershell -ExecutionPolicy Bypass -File .\run.ps1
~~~

Giữ terminal đó mở. Mở http://localhost:3000/login và http://localhost:3001/api/health.

Kết quả mong đợi cho demo blockchain: trang login hiển thị; health báo database up và Fabric connected=true. Local hiện đã cấu hình FABRIC_ENABLED=true, OUTBOX_ENABLED=true, channel diploma, chaincode educert và ví phát hành riêng của Hà Nội. Script chỉ khởi động network hiện có, không tạo mới/reset ledger. Nếu health báo Fabric disabled thì chỉ demo được nghiệp vụ chờ neo, chưa demo thành công blockchain. Không chạy migrate reset, không xóa volume Docker hoặc thư mục .data.

## 3. Đăng nhập và kiểm tra menu HCM

1. Chọn đăng nhập cán bộ/nhà trường, dùng tài khoản HCM.
2. Vào Tổng quan, xem nhãn vai trò CÁN BỘ · LẬP HỒ SƠ.
3. Kiểm tra có Quản lý sinh viên và Quản lý văn bằng; không có Tài khoản & Phân quyền.
4. Thử mở http://localhost:3000/users; tài khoản HCM phải bị đưa về dashboard.

Không cần file ở bước này. Dashboard có thể ít dữ liệu hoặc trống, không phải lỗi khi chưa có hồ sơ.

## 4. Import danh sách 4 sinh viên giả

1. HCM > Quản lý sinh viên > Import sinh viên (Excel), hoặc http://localhost:3000/students/import.
2. Nhấn vùng upload, chọn 01-sinh-vien-demo.xlsx trong thư mục bộ demo.
3. Chọn file là bắt đầu nhập ngay; trang này không có bước preview như import sổ gốc.
4. Đợi kết quả. Lần chạy đầu dự kiến Tạo mới 4, Bỏ qua 0, Tổng dòng 4.
5. Vào Danh sách sinh viên tại /students, tìm từng MSSV 0099999992 đến 0099999995.

Kết quả: có 4 hồ sơ tối thiểu và tài khoản chờ kích hoạt; chưa có hồ sơ tốt nghiệp hay văn bằng từ bước này. Không có mật khẩu sinh viên trả về; không tự gửi email ở thao tác import này.

Với trạng thái hiện tại đã có 4 MSSV, có thể bỏ qua bước này. Nếu cố ý import lại để thử chống trùng, kết quả mong đợi là bỏ qua các dòng đã tồn tại, không thêm sinh viên mới; không kỳ vọng nhập mới 4 lần nữa.

Chụp màn hình kết quả nhập và danh sách sinh viên. Nếu có dòng lỗi, đọc chi tiết; không coi thông báo HTTP thành công là mọi dòng đều nhập được.

## 5. Đọc sổ thật, chỉ preview

1. HCM > Quản lý văn bằng > Import văn bằng (Excel), hoặc http://localhost:3000/import.
2. Chọn D:\datn\diplomachain\26.4 Sổ gốc Phân hiệu năm 2021.2022.2023.2024.xlsx.
3. Bấm Kiểm tra không ghi dữ liệu.
4. Xem tổng dòng và thống kê theo từng sheet.

Kết quả tham chiếu lần quét trước: 1.955 dòng, 483 READY, 1.472 cần rà soát; kết quả có thể thay đổi khi file/danh mục/database thay đổi. Đây là số dòng hồ sơ, không mặc nhiên là số sinh viên duy nhất. READY là đủ điều kiện kỹ thuật theo parser, chưa phải văn bằng được duyệt.

Không bấm Lưu file và staging hoặc Commit các dòng READY với file thật. Preview không tạo hồ sơ/văn bằng.

## 6. Preview và staging sổ demo 2 dòng

1. Vẫn trang /import, bỏ file thật khỏi danh sách rồi chọn 02-so-goc-demo.xlsx.
2. Bấm Kiểm tra không ghi dữ liệu.
3. Lần đầu, trước khi đã có các số bằng demo trong DB, dự kiến tổng 2, READY 1, cần rà soát 1. Lỗi INVALID_STUDENT_CODE ở dòng 2025!3.
4. Bấm Lưu file và staging. Chọn batch đúng tên file nếu chưa được tự chọn.
5. Bộ lọc mặc định NEEDS_REVIEW nên chỉ hiện dòng lỗi; chọn Tất cả dòng để thấy cả 2 dòng.

Kết quả: lưu nguồn file/checksum, batch, dòng và lỗi; chưa tạo hồ sơ tốt nghiệp hoặc văn bằng từ batch. Hai hồ sơ sinh viên đã được tạo ở bước 4.

Tùy chọn, trước khi commit: bấm Lưu file và staging lại cùng file, cùng tài khoản. Phải nhận thông báo file đã có trong staging, không tạo batch bản sao.

## 7. Rà soát dòng lỗi giả

1. Lọc NEEDS_REVIEW, tìm nguồn 2025!3, bấm Rà soát.
2. Trong Corrections JSON đã điền sẵn, chỉ đổi studentCode từ SAI-MSSV thành 0099999995. Giữ các trường khác; programId đã ánh xạ thì không xóa UUID đó.
3. Nếu phải chọn ngành, chọn Công nghệ thông tin ở dropdown để hệ thống đặt programId. Không tự gõ tên ngành vào programId.
4. Nhập ghi chú: Dữ liệu giả phục vụ kiểm thử. Theo bảng định danh của bộ demo, hồ sơ Sinh viên Demo Rà soát có MSSV 0099999995; SAI-MSSV là lỗi chủ động trong fixture.
5. Bấm Kiểm tra và lưu override.
6. Chọn bộ lọc READY. Dự kiến thấy cả 2 dòng. Dòng vừa sửa biến mất khỏi NEEDS_REVIEW là bình thường.

Đây là sửa theo quy định rõ ràng của dữ liệu giả, không suy MSSV thật từ họ tên. File gốc/raw source không bị sửa; correction và ghi chú được lưu riêng. Không copy cách sửa này sang dữ liệu thật nếu chưa có hồ sơ đối chiếu.

## 8. Commit sổ demo và gửi nháp đi duyệt

1. Kiểm tra batch đang chọn đúng 02-so-goc-demo.xlsx, tổng chỉ 2 dòng.
2. Bấm Commit các dòng READY và xác nhận. Nút này commit toàn bộ dòng READY trong batch, không chỉ trang đang xem.
3. Lần đầu sau rà soát thành công: dự kiến nhập 2 hồ sơ, 2 văn bằng DRAFT, 0 xung đột.
4. Vào Danh sách văn bằng /certificates, tìm DEMO-20261015-IMP-01 và DEMO-20261015-IMP-02.
5. Mỗi bản nháp: bấm Gửi duyệt, chọn ngày cấp 15/07/2025, bấm Gửi duyệt xác nhận.

Ngày cấp là giá trị giả đã định nghĩa cho ca test này, không lấy ngày ký quyết định 30/06/2025 để mặc nhiên làm ngày cấp. Trước commit, issuedOn trong sổ demo để trống.

Kết quả: không tạo thêm 2 sinh viên trùng vì 0099999994/0099999995 đã tồn tại; tạo hồ sơ học/tốt nghiệp và hai nháp, sau gửi chuyển sang chờ duyệt. Chưa có snapshot phát hành/neo blockchain.

Tùy chọn: commit lại cùng batch khi các dòng đã IMPORTED phải không nhập lặp; nếu có xung đột, dừng đọc chi tiết thay vì sửa số thật cho qua.

## 9. Lập yêu cầu cấp bằng bằng tay

HCM > Quản lý văn bằng > Lập yêu cầu cấp văn bằng, hoặc /issue. Dùng bảng sau, không cần tải file.

| Trường trên form | Ca phê duyệt | Ca từ chối |
| --- | --- | --- |
| Mã sinh viên | 0099999992 | 0099999993 |
| Họ và tên theo hồ sơ | Sinh viên Demo Phê duyệt | Sinh viên Demo Từ chối |
| Ngày sinh đã xác nhận | 01/01/2002 | 02/02/2002 |
| Ngành đào tạo | Công nghệ thông tin | Công nghệ thông tin |
| GPA hệ 4 | 2.80 | 2.80 |
| Xếp loại theo sổ gốc | Khá | Khá |
| Số hiệu văn bằng | DEMO-20261015-REQ-01 | DEMO-20261015-REQ-02 |
| Số vào sổ | DEMO/20261015/REQ/01 | DEMO/20261015/REQ/02 |
| Lớp | DEMO-20261015-IT | DEMO-20261015-IT |
| Năm tốt nghiệp | 2025 | 2025 |
| Ngày cấp thực tế | 15/07/2025 | 15/07/2025 |

1. Điền ca phê duyệt, bấm Lưu và gửi phê duyệt.
2. Vào lại /issue và điền ca từ chối với đúng mã/cặp số riêng.
3. Vào /pending hoặc /certificates kiểm tra có hai yêu cầu đang chờ.

Mỗi sinh viên của hai ca này khác với sinh viên import sổ, tránh trùng hồ sơ tốt nghiệp/văn bằng. Cơ sở được lấy từ tài khoản HCM. Không dùng số hiệu, số vào sổ thật để thử.

## 10. HCM không tự duyệt; Hà Nội duyệt toàn trường

1. Vẫn tài khoản HCM, vào /pending, tìm đúng DEMO-20261015-REQ-01.
2. Bấm Xem để đối chiếu. HCM không được thấy nút Duyệt/Từ chối.
3. Nếu kiểm tra bằng API, gọi approve bằng token HCM phải nhận 403; yêu cầu vẫn đang chờ. Không cần sửa giao diện để hiện lại nút duyệt.
4. Đăng xuất, đăng nhập Hà Nội; vào /pending tìm các mã demo ORG2.
5. Hà Nội phải thấy hồ sơ HCM, nút duyệt/từ chối hoạt động. Dòng vẫn ghi cơ sở nguồn HCM/ORG2.
6. Nếu kiểm tra thêm admin: không có nút duyệt; gọi approve bằng token admin phải nhận 403. Sau đó quay lại Hà Nội để tiếp tục demo.

Hai cửa sổ trình duyệt bình thường thường dùng chung cookie. Nếu muốn mở đồng thời người lập/người duyệt, dùng cửa sổ thường và ẩn danh, hoặc hai trình duyệt/profile khác nhau. Không đăng nhập hai vai trò trong hai tab cùng profile rồi tưởng phiên tách biệt.

## 11. Hà Nội duyệt và từ chối độc lập

1. Đăng nhập `university` Hà Nội; menu hiển thị `TRỤ SỞ · PHÊ DUYỆT`.
2. Vào /pending, kiểm tra cơ sở HCM và thông tin từng hồ sơ bằng nút Xem.
3. Duyệt DEMO-20261015-REQ-01; xác nhận. Kết quả ngay là ANCHOR_PENDING, sau commit Fabric là ON_CHAIN.
4. Duyệt hai hồ sơ DEMO-20261015-IMP-01 và IMP-02 nếu đã gửi từ bước 8.
5. Với DEMO-20261015-REQ-02: bấm Từ chối, nhập lý do cụ thể, rồi xác nhận. Không dùng lại hồ sơ đã duyệt để test từ chối.
6. Đăng nhập admin chỉ để xem audit; không bấm duyệt.

Kết quả: hồ sơ được Hà Nội phê duyệt có snapshot, anchor ISSUE và sau commit là ON_CHAIN; một hồ sơ REJECTED không có snapshot phát hành. Trong DB, văn bằng bị từ chối có workflow_status REJECTED; dashboard thống kê theo phạm vi tài khoản.

## 12. Verify, Proof, QR, PDF và lịch sử

1. Dùng hồ sơ DEMO-20261015-REQ-01 đã duyệt, chưa thu hồi.
2. Trên /certificates, bấm Verify. Khi Fabric bật và worker commit, kết quả phải là VERIFIED; nếu cố ý tắt Fabric thì ANCHOR_PENDING là đúng.
3. Bấm Copy Proof; mở /verify, dán JSON vào ô xác thực và bấm Xác thực. Không cần upload file Excel ở trang này.
4. Bấm QR Code để mở mã QR. Nếu quét bằng điện thoại, URL localhost trỏ vào điện thoại, không phải PC; chưa cấu hình mạng LAN thì chỉ xem/copy URL và mở trên chính máy tính.
5. Bấm PDF để thử tải bản PDF; file tải được không chứng minh văn bằng đã có trên blockchain, cũng không thay cho chứng thư pháp lý. Kiểm tra nội dung và nhãn trạng thái trước khi trình bày.
6. Admin bấm Audit trên văn bằng để xem lịch sử. Phân biệt nhật ký quản trị với dữ liệu on-chain; khi Fabric bật phải có ANCHOR_COMMITTED sau worker.

Kết quả verify API sau khi ISSUE anchor commit: isValid=true, verificationStatus=VERIFIED. Khi chưa có commit, isValid=false, verificationStatus=ANCHOR_PENDING chỉ phản ánh đang chờ; không phải kết luận thông tin giả mạo và không được giới thiệu là đã xác thực blockchain thành công.

## 13. Thu hồi một văn bằng giả, làm cuối

1. Đăng nhập Hà Nội, chọn đúng DEMO-20261015-REQ-01 đã ON_CHAIN, bấm Thu hồi. HCM/admin không có quyền thao tác này.
2. Nhập lý do Thu hồi dữ liệu giả sau khi kiểm thử, xác nhận.
3. Kiểm tra danh sách chuyển sang REVOKED và Verify không còn hợp lệ.
4. Mở Audit để xem thêm sự kiện thu hồi. Khi Fabric bật, chờ REVOKE anchor COMMITTED rồi Verify mới trả REVOKED.

Không thu hồi văn bằng thật. Không thể dùng hồ sơ vừa thu hồi để tiếp tục demo trạng thái đang hoạt động; hai hồ sơ IMP-01/IMP-02 được giữ để xem lại.

## 14. Các ca test âm tùy chọn

| Thao tác | Kết quả đúng |
| --- | --- |
| Import lại file sinh viên đã nhập | Không tạo thêm hồ sơ/tài khoản trùng; đọc chi tiết từng dòng bỏ qua |
| Lập yêu cầu bằng MSSV 10 số nhưng chưa tồn tại | Bị từ chối, không tự tạo sinh viên ở luồng lập yêu cầu bằng tay |
| Dùng MSSV/họ tên không khớp | Bị từ chối hoặc xung đột, không ghép người tự động |
| Ngày cấp 15/07/2024 nhưng năm tốt nghiệp 2025 | Bị từ chối, không lưu yêu cầu thành công |
| Ngày cấp nằm ở tương lai | Bị từ chối |
| GPA lớn hơn 4 | Form chặn hoặc API trả lỗi |
| Trùng số hiệu/số vào sổ đã dùng | Bị từ chối, không sinh thêm văn bằng |
| HCM tự duyệt hồ sơ do chính mình lập | Bị chặn |
| Cán bộ HCM truy cập /users | Chuyển về dashboard; API danh sách tài khoản chỉ admin |
| Duyệt lại hồ sơ đã duyệt | Bị từ chối, không có snapshot/outbox phát hành thứ hai |

Mẫu JSON/API đã có trong docs/database/api-test-samples.md và bộ Postman api-test-samples.postman_collection.json; không cần tự chuyển file Excel thành base64 khi test bằng Web. Không chạy toàn bộ Postman như một collection không chọn lọc vì có lệnh đổi mật khẩu, đăng xuất và thu hồi.

## 15. Mở database và kiểm tra chỉ đọc

DBeaver/pgAdmin: host 127.0.0.1, port 5432, database diplomachain, user diplomachain_app; mật khẩu APP_DB_PASSWORD trong .env.infrastructure; mở public > Tables. Không dùng tài khoản/mật khẩu đăng nhập Web để kết nối PostgreSQL. Runtime user có quyền ghi, không phải read-only; chỉ mở xem, không bấm chỉnh dữ liệu trực tiếp.

Hoặc PowerShell:

~~~powershell
cd D:\datn\diplomachain
docker compose --env-file .env.infrastructure -f compose.database.yaml exec postgres psql -U diplomachain_app -d diplomachain
~~~

Trong psql:

~~~sql
SET default_transaction_read_only = on;
SELECT student_code, full_name
FROM students
WHERE student_code IN ('0099999992','0099999993','0099999994','0099999995');

SELECT certificate_no, registry_no, status, workflow_status
FROM diplomas
WHERE certificate_no LIKE 'DEMO-20261015-%'
ORDER BY certificate_no;

\dt public.*
\q
~~~

Các bảng: students (người học); accounts/account_memberships (tài khoản và phạm vi); enrollments (hồ sơ theo học, không phải bảng điểm); graduation_records (kết quả tốt nghiệp); diplomas (văn bằng); import_batches/import_rows/validation_issues (staging và lỗi); source_documents (metadata file); diploma_events/audit_logs (lịch sử); diploma_versions/blockchain_anchors/outbox_events (snapshot và chờ đồng bộ).

## 16. Chụp bằng chứng và ghi lỗi

- Chụp mỗi mốc: import sinh viên 4 dòng; preview sổ demo 1 READY/1 lỗi; correction có ghi chú; commit 2 nháp; HCM bị chặn tự duyệt; Hà Nội duyệt/từ chối; ANCHOR_PENDING rồi ON_CHAIN; verify VERIFIED; thu hồi văn bằng giả.
- Khi lỗi, ghi tài khoản/cơ sở, URL, file hoặc MSSV/số hiệu, thao tác, thông báo nguyên văn và ảnh. Không chụp mật khẩu/JWT/OTP.
- Dừng nếu có xung đột dữ liệu thật. Không sửa số hiệu thật hoặc đánh dấu rà soát hàng loạt chỉ để demo đi tiếp.
- Không xóa volume, reset migration hay xóa .data để làm lại. Dữ liệu giả sẽ còn trong DB sau test; dùng bộ mã khác cho lần sau nếu cần.
