import Chat from '@/components/chat';
import Image from 'next/image';
import { generateId } from 'ai';

export default function Home() {
    const id = generateId();
    return <Chat id={id} />;
}
