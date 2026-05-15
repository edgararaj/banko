import Image from "next/image";
import CSVImport from './components/CSVImport';

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center app-body">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-12 px-4 sm:items-start gap-6">
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Image
              className="invert"
              src="/next.svg"
              alt="Next.js logo"
              width={100}
              height={20}
              priority
            />
            <h1 className="app-h1">Banko — Local-first Group Expense PWA</h1>
          </div>
        </div>

        <div className="w-full flex flex-col gap-6 md:flex-row md:items-start">
          <CSVImport />
          <div className="flex-1 p-4 bg-[#0b1221] rounded">
            <h2 className="app-h2">Welcome</h2>
            <p className="small-muted">Use the CSV importer to load transactions. All processing happens locally in your browser (IndexedDB).</p>
          </div>
        </div>

      </main>
    </div>
  );
}
