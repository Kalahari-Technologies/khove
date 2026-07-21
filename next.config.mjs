/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@splinetool/react-spline", "@splinetool/runtime"],
  serverExternalPackages: ["@prisma/client"],
  outputFileTracingIncludes: {
    "/api/inngest": ["./mail_templates/**/*"],
  },
  webpack: (config) => {
    config.resolve.conditionNames = ["browser", "import", "module", "default"];
    return config;
  },
};

export default nextConfig;
