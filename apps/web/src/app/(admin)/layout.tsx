// src/app/(admin)/layout.tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white">
      {/* Đã loại bỏ Header xanh đậm và Sidebar trùng lặp */}
      {children}
    </main>
  );
}