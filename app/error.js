"use client";

export default function ErrorPage({ reset }) {
  return (
    <main className="wrap" lang="sl">
      <section className="hero">
        <h1>Dogodkov trenutno ni mogoče naložiti.</h1>
        <p>Poskusi znova čez trenutek. To ne pomeni, da v Celju ni dogodkov.</p>
        <button type="button" className="all-events" onClick={reset}>Poskusi znova</button>
      </section>
    </main>
  );
}
