import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ondo/ui", "@ondo/api"],
  // worktree가 onDo 안에 있어 Next가 바깥 onDo를 root로 잡는 걸 막는다(#448)
  turbopack: { root: path.join(__dirname, "../..") },
};

export default nextConfig;
