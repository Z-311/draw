import DrawingApp from '@/components/DrawingApp';

export const dynamic = 'force-dynamic';

export default function Page() {
  const configured = Boolean(process.env.ARK_API_KEY && process.env.ARK_MODEL);
  return <DrawingApp configured={configured} />;
}
