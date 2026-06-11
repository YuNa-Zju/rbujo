import { defineConfig } from "vite";

import react from "@vitejs/plugin-react";

import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/

export default defineConfig({
  plugins: [react(), tailwindcss()],

  base: "/",

  server: {
    proxy: {
      // 代理配置

      "/api": {
        target: "http://127.0.0.1:10001",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // build: {

  //   // 稍微调高一点警告阈值（比如 1000kb），因为有些库比如 react-dom 本身就很大，很难拆得更小

  //   chunkSizeWarningLimit: 1000,

  //   rollupOptions: {

  //     output: {

  //       // ✅ 核心配置：精细化手动分包

  //       manualChunks(id) {

  //         if (id.includes("node_modules")) {

  //           // 1. 单独拆分 date-fns

  //           if (id.includes("date-fns")) {

  //             return "date-fns";

  //           }

  //           // 2. 单独拆分 Markdown 相关

  //           if (

  //             id.includes("react-markdown") ||

  //             id.includes("remark") ||

  //             id.includes("rehype") ||

  //             id.includes("unified")

  //           ) {

  //             return "markdown-libs";

  //           }

  //           // 3. 单独拆分 Lucide 图标

  //           if (id.includes("lucide-react")) {

  //             return "lucide-icons";

  //           }

  //           // 4. ✅ 核心修复：React 核心 + 它的底层依赖

  //           // 必须把 scheduler 和 prop-types 也加进来，否则会循环引用

  //           if (

  //             id.includes("react") ||

  //             id.includes("react-dom") ||

  //             id.includes("react-router-dom") ||

  //             id.includes("scheduler") || // 关键！

  //             id.includes("prop-types") // 关键！

  //           ) {

  //             return "react-core";

  //           }

  //           // 5. 剩下的丢进 vendor

  //           return "vendor";

  //         }

  //       },

  //     },

  //   },

  // },

  resolve: {
    // 确保 React 实例唯一

    dedupe: ["react", "react-dom"],
  },

  build: {
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // 1. React 核心家族（必须严丝合缝地在一起，解决 createContext 问题）

            if (
              id.match(
                /node_modules\/(react|react-dom|scheduler|prop-types|jsx-runtime)\//,
              )
            ) {
              return "vendor-react-core";
            }

            // 2. Markdown + 数学公式 (KaTeX)

            // 把它们合在一起，因为它们互相引用极其频繁，分开容易导致循环依赖

            if (
              id.includes("react-markdown") ||
              id.includes("remark") ||
              id.includes("rehype") ||
              id.includes("unified") ||
              id.includes("katex") || // 包含 katex 库本身
              id.includes("micromark") ||
              id.includes("vfile") ||
              id.includes("unist")
            ) {
              return "vendor-markdown-math";
            }

            // 3. 图标库独立

            if (id.includes("lucide-react")) {
              return "vendor-icons";
            }

            // 4. 其他较大的独立库

            if (id.includes("date-fns")) {
              return "vendor-utils";
            }

            // ⚠️ 重要：不要在这里写 return "vendor"

            // 剩下的零散小包（比如 axios, clsx 等）让 Vite 自动合并到主包或自动生成的 vendor 中

            // 这样可以彻底避免手动分包导致的 Circular chunk 错误
          }
        },
      },
    },
  },
});
