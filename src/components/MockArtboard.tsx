/**
 * Demo deliverable (Northstar landing page) shown when a version has no file.
 * It is client content: it keeps its own colors and sizes (see .mock-* in globals.css).
 * Render it inside an `.artboard` / `.client-artboard` container.
 */
export function MockArtboard() {
  const stop = (event: React.MouseEvent) => event.stopPropagation();
  return (
    <>
      <div className="mock-nav">
        <b>
          northstar<span>.</span>
        </b>
        <span>Solutions</span>
        <span>À propos</span>
        <span>Ressources</span>
        <button onClick={stop}>Nous contacter →</button>
      </div>
      <div className="mock-hero">
        <div className="hero-copy">
          <small>CONSTRUIRE MIEUX, ENSEMBLE</small>
          <h2>
            Des idées qui
            <br />
            <em>avancent.</em>
          </h2>
          <p>Nous aidons les équipes ambitieuses à transformer leurs défis complexes en opportunités durables.</p>
          <button onClick={stop}>
            Découvrir notre approche <span>→</span>
          </button>
        </div>
        <div className="hero-shape">
          <div className="shape-line line-one" />
          <div className="shape-line line-two" />
          <div className="shape-core">N</div>
        </div>
      </div>
      <div className="mock-footer">
        <span>Northstar Studio · 2026</span>
        <span>01 — Introduction</span>
      </div>
    </>
  );
}
