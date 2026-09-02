import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nan Map",
  description: "旅游攻略地图编辑器",
};

/**
 * 根布局组件接口。
 *
 * 使用 Next.js 生成的 LayoutProps 保持路由类型一致；这里只接收当前路由树要渲染的内容。
 */
type RootLayoutProps = LayoutProps<"/">;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
