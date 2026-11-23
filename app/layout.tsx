import { AudioProvider } from "@/context/AudioContext";
import type { Metadata } from "next";
import CustomCursor from "@/components/cursor";
import "./globals.css";

export const metadata: Metadata = {
  icons: {
    icon: "/image/logo.png",
  },
  title: "know Samvidhan",
  description: "Acknowledge the Constitution of India in an interactive way",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <CustomCursor />
        <AudioProvider>{children}</AudioProvider>
      </body>
    </html>
  );
}
