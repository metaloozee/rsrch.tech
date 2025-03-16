import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';

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
                {children}
                <Toaster position="top-center" />
            </body>
        </html>
    );
}
