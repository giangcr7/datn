# Báo cáo bảo vệ khóa và khôi phục

Ngày: **04/11/2026**, múi giờ Asia/Ho_Chi_Minh. Phạm vi: môi trường đồ án Windows hiện tại; không phải kiểm toán độc lập hoặc xác nhận đủ điều kiện production.

## Kết quả đã áp dụng trên máy

| Hạng mục                          | Kết quả quan sát                                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kiểm kê                           | 247 dòng metadata, trong đó 149 bản chứng thư công khai. Đây là số bản sao tệp, không phải số danh tính duy nhất. Danh sách chi tiết trong kiem-ke-khoa-2026-11-04.json, không chứa private key, mật khẩu hoặc nội dung môi trường.                     |
| Hạn chứng thư                     | Không phát hiện chứng thư hết hạn hoặc còn dưới 60 ngày trong các bản công khai đọc được. Chứng thư wallet ứng dụng hết hạn 15/10/2027 lúc 05:44 UTC. Không thay hoặc gia hạn chứng thư thật.                                                           |
| Wallet ứng dụng                   | Bọc DPAPI CurrentUser, lưu ngoài mã nguồn tại %LOCALAPPDATA%\DiplomaChain\secrets\6aba09b61b7a. Cấu hình API trỏ đến bản được bảo vệ; bản wallet cũ cũng không còn PEM private key rõ.                                                                  |
| Khóa enroll trùng                 | Một file private key trong wallet/issuer-org1-msp/keystore đã được bảo vệ DPAPI sau khi sao lưu và kiểm tra khôi phục. Không để sót bản enroll rõ cạnh wallet đã mã hóa.                                                                                |
| Danh tính ứng dụng                | Giữ nguyên cặp khóa/chứng thư, MSP và fingerprint; ký/kiểm tra chữ ký trong bộ nhớ thành công. Ghim fingerprint bằng ORG1_WALLET_CERT_SHA256; tắt đọc legacy mặc định.                                                                                  |
| Quyền tệp dự án                   | Sao lưu DACL mã hóa trước khi thay; siết 734 tệp/thư mục. Audit sau thay đổi kiểm tra 735 đích, không còn allow grant ngoài tài khoản vận hành, SYSTEM và Administrators. Một đích bằng chứng lịch sử không được đổi quyền.                             |
| Vault                             | Audit 10 đích gồm vault và các tệp bên trong; không có allow grant ngoài chính sách. Các snapshot DACL và hai backup được giữ để quay lại, không commit.                                                                                                |
| Kiểm tra quyền không được phép    | Token anonymous bị từ chối mở để đọc và ghi trên 404 tệp có thể kiểm tra; các tệp vault cũng từ chối đọc/ghi với token này. Không ghi bất kỳ byte nào vào tệp thử quyền.                                                                                |
| Sao lưu nội bộ                    | Hai snapshot DPAPI, mỗi snapshot khôi phục được 404 tệp trong bộ nhớ. Kiểm tra hash từng tệp; wallet từ backup có fingerprint như hiện tại và ký/kiểm tra chữ ký thành công. Không ghi PEM rõ ra đĩa.                                                   |
| Bằng chứng lịch sử không đọc được | Một archive configuration-and-wallet.tar.gz đã bị ACL chặn từ trước; báo omitted, giữ nguyên nội dung và quyền. Không cưỡng ép mở để làm đẹp số liệu backup.                                                                                            |
| Toàn vẹn nội dung                 | So sánh hash 447 tệp PDF, dữ liệu sao lưu có thể đọc, khóa/chứng thư ký PDF và crypto Fabric: không có thay đổi nội dung. 16 tệp bằng chứng vốn không đọc được không bị can thiệp. Không chạy lệnh reset DB, xóa volume, thay ledger hoặc tái sinh PDF. |
| Docker                            | Helper tạm thời, không mạng, read-only, bỏ capabilities đọc được mount khóa TLS peer/orderer sau hardening. Helper đã thoát và được --rm xóa; không khởi động lại node thật.                                                                            |
| Mạng Fabric thật                  | Peer, orderer, CA đang dừng; kiểm tra kết nối báo gateway không sẵn sàng. PostgreSQL đang chạy. Không thực hiện phát hành, ghi ledger, kiểm tra endorsement/commit hoặc cập nhật CRL thật.                                                              |

Backup chuyển máy cũng được diễn tập trên dữ liệu thực **chỉ trong bộ nhớ** sau migration: chuẩn hóa wallet/enroll, mã hóa và giải mã bằng scrypt + AES-256-GCM, 404 tệp khớp hash và một bằng chứng báo omitted. Không tạo file backup chuyển máy chưa có người giữ passphrase. Kiểm tra cây wallet không còn file chứa PEM private key rõ.

Fingerprint công khai của danh tính ứng dụng, không phải khóa bí mật:

```text
adda8749847d2e8a1ced307d1dedf0919b6e0eb2b7012bcba07f72e5c8b5678f
```

## Trường hợp kiểm thử tự động

Các fixture dùng khóa/chứng thư tổng hợp trong thư mục tạm riêng, xóa bằng finally; không dùng dữ liệu văn bằng thật. Các bài kiểm thử chaincode dùng context giả, không giao dịch với mạng thật.

| Nhóm                 | Tình huống                                                                                             | Kỳ vọng                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| DPAPI                | Bảo vệ/khôi phục, sai purpose, sửa ciphertext                                                          | Khôi phục đúng dữ liệu; từ chối ngữ cảnh sai hoặc dữ liệu bị sửa.                                                           |
| Wallet               | Thiếu file, JSON lỗi, sai MSP, sai pin, thiếu pin, cặp khóa/chứng thư không khớp                       | Từ chối đóng, lỗi không chứa dữ liệu bí mật.                                                                                |
| Wallet               | Chứng thư hết hạn/chưa hiệu lực; sửa ciphertext hoặc metadata chứng thư công khai                      | Không chấp nhận danh tính.                                                                                                  |
| Legacy               | Không opt-in; production kể cả có opt-in                                                               | Không mở wallet rõ.                                                                                                         |
| Ký trong bộ nhớ      | Load wallet được bảo vệ rồi ký challenge                                                               | Chữ ký khớp khóa công khai; không tạo file runtime chứa khóa rõ.                                                            |
| ACL                  | Backup, siết quyền, siết lại lần nữa, probe read/write, khôi phục                                      | Áp dụng và khôi phục đúng DACL; không đổi owner/SACL hoặc đòi đặc quyền không cần thiết.                                    |
| Đường dẫn            | Đích ACL ngoài roots; backup có traversal, alternate stream hoặc trùng tên                             | Từ chối, không ghi ra đích ngoài phạm vi.                                                                                   |
| Backup chuyển máy    | Đúng/sai passphrase, sửa salt/nonce/tag/ciphertext, định dạng sai                                      | Chỉ dữ liệu đúng mới xác thực được; mỗi backup dùng salt/nonce mới.                                                         |
| Bản enroll đã mã hóa | Chuẩn hóa key và wallet từ DPAPI vào gói chuyển máy                                                    | Chỉ giải mã trong bộ nhớ; file nguồn trên đĩa vẫn được mã hóa.                                                              |
| Chaincode            | MSP khác và thiếu diploma.issuer=true                                                                  | Hợp đồng từ chối ở bước phân quyền, không chạm ledger.                                                                      |
| Log                  | Trường lồng nhau, token camelCase, PEM, Bearer, DB URL, Error stack, metadata Winston, vòng tham chiếu | Che các dạng bí mật đã có kiểm thử; không dump cấu hình. Không bảo đảm phát hiện mọi chuỗi bí mật tự do trong mọi thư viện. |
| Kiểm kê              | PEM cạnh JSON wallet; phân loại CA keystore; không lộ ciphertext/key                                   | Metadata được đọc đúng, không đưa dữ liệu bí mật vào báo cáo.                                                               |

Lệnh tái kiểm tra:

```powershell
npm run test:keys
npm test -w api -- --runInBand --no-cache
npm run keys:audit
```

Kết quả cuối trước khi commit:

- Build API và chaincode: **đạt**.
- Toàn bộ Jest API: **40 suite, 674 bài kiểm thử đạt**, bao gồm 19 bài mới về backup và che log.
- Kiểm thử khóa biệt lập: **23 trường hợp đạt**; Node runner báo 24 test khi tính thêm test cha.
- ESLint các tệp TypeScript thuộc thay đổi: **đạt**; kiểm tra cú pháp JavaScript và hai script PowerShell: **đạt**.
- Đã kiểm tra định dạng và khoảng trắng của patch; các fixture tạm được xóa, không dừng dịch vụ của người dùng.

Các kết quả này không thay cho kiểm thử mạng Fabric thật hoặc quét toàn bộ lỗ hổng của website.

## Giới hạn và việc anh cần thực hiện

1. **Chưa có backup ngoại tuyến thật.** Công cụ backup chuyển máy và diễn tập mật mã đã có, nhưng anh cần tự nhập passphrase, chép .keybackup ra thiết bị ngoại tuyến và cất passphrase riêng. Hai bản .dpapi local không đủ cho tình huống mất máy/tài khoản.
2. **Chưa kiểm thử đăng nhập bằng tài khoản Windows thứ hai.** Đã có audit DACL và probe anonymous; không đánh đồng với kiểm thử mọi tài khoản hoặc chống Administrators/Docker administrator.
3. **Chưa tách tài khoản dịch vụ.** CLI hiện chạy dưới GIANG\Giang; API dùng wallet phải chạy bằng tài khoản bảo vệ này. Tài khoản đó vẫn quản trị được dữ liệu của chính mình; nếu tài khoản bị chiếm, DPAPI không bảo vệ khỏi chương trình chạy dưới cùng danh tính.
4. **Container còn điểm cần hardening riêng.** Fabric dùng mặc định root, mount crypto đang read-write và peer có Docker socket. Không tự thay user hoặc tạo lại container khi chưa kiểm thử tương thích và kế hoạch bảo trì. Kiểm tra mount đọc được không chứng minh toàn bộ phân quyền container đạt production.
5. **Mật khẩu PDF và cấu hình vẫn trong cùng miền tài khoản.** Đã siết ACL và backup; chưa chuyển toàn bộ secret sang secret manager, chưa tích hợp USB Token/HSM, chưa thay giá trị pháp lý của chứng thư nội bộ.
6. **Thu hồi/gia hạn mới có quy trình, chưa diễn tập CA thật.** Cần mạng biệt lập để thử cấp thay thế, revoke, CRL và cập nhật MSP; tuyệt đối không reset ledger thật để trình diễn.
7. **Khóa đã từng đưa vào chat cần thu hồi tại bên cấp.** Công cụ không tự vào tài khoản nhà cung cấp AI/email để thu hồi thay anh. Không ghi lại giá trị đó trong báo cáo hoặc Git.

## Tệp được giữ có chủ đích

- Mã nguồn bảo vệ wallet, che log, kiểm tra môi trường; công cụ quản lý khóa và bài kiểm thử hồi quy.
- Bảng quản lý, sơ đồ ký, quy trình khôi phục/thu hồi và báo cáo kiểm kê công khai.
- Ngoài Git: wallet đã mã hóa, hai snapshot backup, các bản DACL đã mã hóa và cấu hình API đã cập nhật.
- Toàn bộ thay đổi hoặc tệp không thuộc tác vụ có sẵn từ trước được giữ nguyên; không đưa vào commit của tác vụ này.
