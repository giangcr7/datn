/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  poweredByHeader: false,
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
};
export default nextConfig;
