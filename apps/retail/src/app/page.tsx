import { Button } from "@ondo/ui";

export default function Page() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-semibold">onDo 소매</h1>
      <div className="flex items-center gap-4">
        <Button>장바구니 담기</Button>
        <Button variant="line">찜하기</Button>
        <Button variant="soft" size="lg">
          공유
        </Button>
      </div>
    </main>
  );
}
