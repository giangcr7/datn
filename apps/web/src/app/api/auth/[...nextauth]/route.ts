import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

// Access token backend cấp có hạn 15 phút — trừ hao 30s để tránh trường hợp
// vừa hết hạn ngay lúc dùng do lệch giờ nhẹ giữa client/server.
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000 - 30 * 1000;

async function refreshAccessToken(token: any) {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: token.refreshToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Refresh thất bại");

    return {
      ...token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token, // rotation — backend luôn cấp refresh token mới
      accessTokenExpires: Date.now() + ACCESS_TOKEN_TTL_MS,
      error: undefined,
    };
  } catch (err) {
    // Refresh thất bại (hết hạn 7 ngày / bị thu hồi / reuse detection) —
    // đánh dấu lỗi để phía client biết mà signOut(), không giữ session "sống ảo".
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
        role: { label: "Role", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !credentials?.role) {
          throw new Error("Vui lòng nhập đầy đủ thông tin!");
        }

        const res = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
            role: credentials.role,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Đăng nhập thất bại!");

        return {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          role: data.user.role,
          mssv: data.user.mssv,
          mustChangePassword: data.user.mustChangePassword,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Lần đăng nhập đầu tiên — lưu token từ backend
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.mssv = (user as any).mssv;
        token.mustChangePassword = (user as any).mustChangePassword;
        (token as any).accessToken = (user as any).accessToken;
        (token as any).refreshToken = (user as any).refreshToken;
        (token as any).accessTokenExpires = Date.now() + ACCESS_TOKEN_TTL_MS;
        return token;
      }

      // Access token còn hạn — dùng lại, không gọi refresh thừa
      if (Date.now() < (token as any).accessTokenExpires) {
        return token;
      }

      // Hết hạn — tự động refresh
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).mssv = token.mssv;
        (session.user as any).mustChangePassword = token.mustChangePassword;
        (session as any).accessToken = (token as any).accessToken;
        // Client theo dõi field này — nếu có giá trị nghĩa là refresh đã thất bại,
        // phải signOut() và bắt đăng nhập lại.
        (session as any).error = (token as any).error;
      }
      return session;
    },
  },
  events: {
    // Khi user bấm logout — báo cho backend thu hồi refresh token trong DB,
    // không chỉ xoá cookie session phía client.
    async signOut({ token }) {
      const refreshToken = (token as any)?.refreshToken;
      if (refreshToken) {
        try {
          await fetch(`${API_URL}/auth/logout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
          });
        } catch {
          // Không chặn signOut phía client dù revoke phía server thất bại
        }
      }
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };