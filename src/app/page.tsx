export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <h1 className="text-5xl font-semibold tracking-tight">Said Who?</h1>
      <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        Paste a quote you saw online and find out where it first appeared, with a link for every step.
      </p>
      <p className="text-sm text-zinc-500">
        Being built for the Nebius x NVIDIA Global AI Hackathon.{" "}
        <a className="underline underline-offset-4" href="https://github.com/SelcukOzbilgi/saidwho">
          Follow along on GitHub
        </a>
      </p>
    </main>
  );
}
