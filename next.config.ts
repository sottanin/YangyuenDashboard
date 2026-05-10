import type { NextConfig } from "next"
import path from "path"

const nextConfig: NextConfig = {
  // "standalone" emits .next/standalone/server.js with a minimal bundled
  // node_modules — required by the Dockerfile runner stage.
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname),
  },
}

export default nextConfig
