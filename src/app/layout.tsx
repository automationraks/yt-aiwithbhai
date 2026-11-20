import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title:"AIWithBh@i | AI Systems Learning Studio", description:"Research and content operations for AI systems architecture, LLM engineering and system design education." };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
