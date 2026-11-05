/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // postgres.js uses Node built-ins (net, tls); keep it out of the server bundle.
    serverComponentsExternalPackages: ["postgres"],
    // صفحة التهيئة تقرأ ملفات الترحيل وقت التشغيل، فتُضمّن مع دالتها عند النشر
    outputFileTracingIncludes: {
      "/api/setup": ["./supabase/migrations/**/*"],
    },
  },
};

export default nextConfig;
