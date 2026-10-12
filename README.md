# DiplomaChain

Hệ thống quản lý, phê duyệt và xác thực văn bằng số, với PostgreSQL làm nguồn dữ liệu nghiệp vụ, file nguồn lưu riêng và Hyperledger Fabric chỉ neo hash.

## Kiến trúc dữ liệu

- `Student → Enrollment → GraduationRecord → Diploma → DiplomaVersion` tách riêng người học, quá trình học, tốt nghiệp, văn bằng và snapshot đã phê duyệt.
- Excel → private storage + checksum → staging → đối chiếu/override có audit → commit hồ sơ hợp lệ.
- Người lập không tự phê duyệt. Transaction phê duyệt tạo snapshot và outbox; chỉ có `ON_CHAIN` sau Fabric commit.
- MongoDB cũ và Fabric ledger cũ chưa tự động cutover; không xóa hoặc ghi đè dữ liệu cũ.

## Chạy local

Yêu cầu: Node.js tương thích Prisma 7 (đã kiểm thử bằng Node 24), npm và Docker Compose. Cài dependencies bằng `npm ci`.

1. Copy `.env.infrastructure.example` thành `.env.infrastructure`; đặt secret khác nhau cho admin, migrator và runtime.
2. Copy `apps/api/.env.example` thành `apps/api/.env`; điền `DATABASE_URL` và `JWT_SECRET`. API chỉ giữ quyền runtime.
3. Copy `apps/api/.env.database.example` thành `apps/api/.env.database`; điền `DIRECT_DATABASE_URL` bằng role migrator.
4. Copy `apps/web/.env.example` thành `apps/web/.env.local`; điền `NEXTAUTH_SECRET`. Đặt email/password bootstrap trong API env; seed không ghi đè mật khẩu đã có.
5. Windows: `powershell -ExecutionPolicy Bypass -File .\run.ps1`. Linux/macOS: `bash ./start.sh`.

Script local start PostgreSQL, generate/migrate/seed và khởi chạy API/Web. Không tự tải binaries, tạo lại channel hoặc deploy Fabric. URL mặc định: Web `http://localhost:3000`, API `http://localhost:3001/api`, Swagger `http://localhost:3001/docs`. Log nằm trong `.data/logs`; dừng API/Web không xóa database volume.

## Kiểm tra

```powershell
npm run build -w api
npm run build -w @diploma-chain/web
npm run build -w chaincode
npm run test -w api -- --runInBand
npm run test:database -w api
node scripts/smoke-api.mjs
npm run db:erd -w api
```

Xem `docs/database/README.md` để mở ERD SVG/DBML/Mermaid, từ điển dữ liệu, mapping Excel và checklist production. File Excel gốc được giữ nguyên. Không đưa dữ liệu chưa đối chiếu vào business tables.
