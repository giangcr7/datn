# Luồng HCM → Hà Nội → Blockchain

Ngày kiểm thử: 15/10/2026. Đây là luồng chuẩn trên local/test; không dùng dữ liệu thật để thu hồi.

## Quy tắc nghiệp vụ

1. HCM là `cơ sở nguồn`: tạo sinh viên, nhập sổ gốc, lập/gửi hồ sơ văn bằng.
2. Hà Nội là `trụ sở phát hành`: xem hàng chờ toàn trường, kiểm tra hồ sơ và phê duyệt độc lập.
3. Sau phê duyệt, PostgreSQL tạo snapshot/hash và outbox; worker gửi giao dịch `AnchorDiploma` bằng MSP của Hà Nội (`Org1MSP`).
4. Chỉ khi Fabric commit thành công mới chuyển sang `ON_CHAIN`/`VERIFIED`; `ANCHOR_PENDING` không phải đã ghi blockchain.
5. Admin chỉ quản trị hệ thống/audit, không được phê duyệt, phát hành hoặc thu hồi thay cán bộ Hà Nội.
6. HCM vẫn là `org=ORG2`; `issuerOrg=ORG1` cho biết nơi phát hành. Không đổi nguồn hồ sơ sang Hà Nội.

## Kiểm tra trước demo

```powershell
cd D:\datn\diplomachain
docker ps
powershell -ExecutionPolicy Bypass -File .\scripts\start-fabric-local.ps1
Invoke-WebRequest http://localhost:3001/api/health
```

Health phải có `fabric.connected=true`. Nếu đang dùng bản tắt Fabric, đặt `FABRIC_ENABLED=false` và kết quả đúng sẽ là `ANCHOR_PENDING`, không được gọi là đã on-chain. Không chạy `network.sh down`, `docker compose down -v` hoặc `prisma migrate reset`.

## Demo giao diện

### Bước 1 — HCM lập hồ sơ

- Đăng nhập tài khoản `university` HCM.
- Vào `Quản lý sinh viên → Import sinh viên` và chọn `outputs/demo-20261015/01-sinh-vien-demo.xlsx`, hoặc tạo sinh viên mới.
- Vào `Quản lý văn bằng → Lập yêu cầu cấp văn bằng`. Chọn một MSSV đã có, ví dụ `0099999992`; nhập ngày cấp `2025-07-15`, số hiệu/số vào sổ chưa trùng.
- Bấm `Lưu và gửi duyệt`. Kết quả: `PENDING`, chưa có hash/snapshot.
- Tài khoản HCM không có quyền phê duyệt; gọi nút duyệt hoặc API phải trả `403`.

### Bước 2 — Hà Nội kiểm tra và duyệt

- Đăng xuất; đăng nhập tài khoản `university` Hà Nội.
- Vào `Phê duyệt tại trụ sở`. Danh sách phải thấy hồ sơ có cơ sở nguồn `ORG2`.
- Bấm `Xem`, đối chiếu MSSV, họ tên, ngày sinh, ngành, xếp loại, ngày cấp, số hiệu, số vào sổ và quyết định tốt nghiệp.
- Bấm `Duyệt`. API trả `ANCHOR_PENDING`, `issuerMspId=Org1MSP`; đây là lúc đã duyệt nghiệp vụ nhưng worker còn chờ commit.
- Chờ khoảng 5–15 giây rồi tải lại danh sách. Kết quả phải là `ON_CHAIN`, có `txId`.

### Bước 3 — Xác thực

- Ở danh sách văn bằng, bấm `Verify`. Kết quả đúng là `VERIFIED`, `isValid=true`.
- Bấm `Copy Proof`, mở trang `Tra cứu công khai`, dán proof và xác thực lại.
- Mở `Khám phá Blockchain`: xem anchor trong danh sách giao dịch; `blockNumber` và `txId` phải lấy từ anchor đã commit, không phải số giả.

### Bước 4 — Từ chối

- HCM lập yêu cầu thứ hai, ví dụ MSSV `0099999993`.
- Hà Nội mở hàng chờ, chọn `Từ chối`, nhập lý do cụ thể.
- Kết quả: `REJECTED`, không tạo `diploma_versions`, không có anchor ISSUE.

### Bước 5 — Thu hồi

- Chỉ Hà Nội chọn văn bằng `ON_CHAIN`, bấm `Thu hồi`, nhập lý do.
- Worker ghi `RevokeDiplomaAnchor` bằng MSP phát hành `Org1MSP`.
- Verify trả `REVOKED`/`isValid=false`; HCM và admin gọi thu hồi phải bị `403`.

## Kiểm thử tự động có ghi ledger

Lệnh dưới đây tạo dữ liệu giả mới và giao dịch không thể xóa khỏi ledger; chỉ chạy local/test:

```powershell
node scripts/test-headquarters-chain.mjs --write-demo
```

Kịch bản kiểm tra 19 điều kiện: Fabric health, capability của ba vai trò, HCM nhìn thấy nguồn, Hà Nội nhìn thấy hàng chờ, chặn HCM/admin duyệt, approve/commit/verify, HCM origin + Hà Nội issuer, tampered proof, idempotency, xung đột hash, reject, revoke và history. Báo cáo nằm trong `outputs/headquarters-<timestamp>/result.json`; không đưa thư mục này lên GitHub.

## Tài khoản

| Vai trò | Cơ sở | Quyền test |
|---|---|---|
| `university` HCM | `ORG2` | Tạo/import sinh viên, lập và gửi yêu cầu |
| `university` Hà Nội | `ORG1` | Phê duyệt/từ chối/thu hồi và phát hành lên Fabric |
| `admin` | Hệ thống | Quản lý tài khoản/audit, không duyệt nghiệp vụ |

Email/mật khẩu đọc từ `BOOTSTRAP_*` trong `apps/api/.env`; không ghi mật khẩu vào tài liệu hoặc GitHub.

## Bằng chứng cần chụp

- Health có Fabric connected.
- HCM gửi hồ sơ và thấy `ORG2`.
- Hà Nội thấy hồ sơ HCM nhưng HCM/admin bị chặn nút/API duyệt.
- Sau commit có `ON_CHAIN`, `txId`, `issuerOrg=ORG1`.
- Verify `VERIFIED`, sau sửa proof là `HASH_MISMATCH`, sau revoke là `REVOKED`.
- Bản ghi `diploma_events`, `blockchain_anchors`, `outbox_events` tương ứng trong Prisma Studio/DB viewer.
