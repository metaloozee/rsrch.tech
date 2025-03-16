import './globals.css';

import type { Metadata } from 'next';

import { Geist } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { Analytics } from '@vercel/analytics/next';

const geistSans = Geist({
    subsets: ['latin'],
});

export const metadata: Metadata = {
    title: 'Mistral Research',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`${geistSans.className} antialiased h-screen w-full bg-neutral-950 dark`}
            >
                <Analytics />
                {children}
                <Toaster position="top-center" />
            </body>
        </html>
    );
}
