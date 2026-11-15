import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title:"Industrial Hub | YouTube Intelligence", description:"Hindi industrial manufacturing and engineering channel research dashboard." };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="hi"><body>{children}</body></html>}
