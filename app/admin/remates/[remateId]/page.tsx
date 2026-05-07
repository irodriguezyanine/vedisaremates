import { RemateEditor } from "@/components/admin/remate-editor";

type Props = { params: Promise<{ remateId: string }> };

export default async function AdminRemateDetailPage({ params }: Props) {
  const { remateId } = await params;
  return <RemateEditor remateId={remateId} />;
}
