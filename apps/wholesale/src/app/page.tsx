import { Button } from "@ondo/ui";

export default function Page() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-semibold">onDo 도매</h1>
      <div className="flex items-center gap-4">
        <Button>저장</Button>
        <Button variant="secondary">취소</Button>
        <Button variant="destructive" size="lg">
          삭제
        </Button>
      </div>
    </main>
  );
}
