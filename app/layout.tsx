import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Frame Glue SPC | ILLUMINATE', description: 'Frame gluing process control dashboard and line product configuration.', icons: { icon: '/favicon.svg' } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
