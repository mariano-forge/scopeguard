"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, FileText, Lock, MousePointer2, Pause, Play, ScrollText, Send, Upload } from "lucide-react";
import { Plant } from "./Mockups";
import "./film.css";

const moves = [
  { name: "Partager", caption: "Déposez le livrable, invitez le client." },
  { name: "Commenter", caption: "Le client demande ses modifications sur place." },
  { name: "Chiffrer", caption: "Une demande hors scope ? Chiffrez-la." },
  { name: "Valider", caption: "Le client accepte, tout est consigné." },
];

/** One play of a scene, then a short rest (film.css times each scene within 6 s). */
const loopSeconds = 7.5;

/**
 * Where a piece sits in its tile, in % (the cursor's paths in film.css use the same grid), and when it
 * comes in, in seconds from the start of the scene.
 */
const at = (x: number, y: number, w?: number, t?: number, h?: number) =>
  ({ left: `${x}%`, top: `${y}%`, width: w === undefined ? undefined : `${w}%`, height: h === undefined ? undefined : `${h}%`, "--at": `${t ?? 0}s` }) as React.CSSProperties;
const when = (t: number) => ({ "--at": `${t}s` }) as React.CSSProperties;

function Cursor() {
  return (
    <span className="f-cursor">
      <MousePointer2 />
    </span>
  );
}

/** A click: the ring that spreads where the cursor pressed. */
function Ripple({ x, y, t }: { x: number; y: number; t: number }) {
  return <span className="f-ripple" style={at(x, y, undefined, t)} />;
}

/**
 * 1. The agency drags the file in: it becomes a deliverable, then the client is invited.
 * Every piece the cursor touches is placed in % of the tile, so its path (film.css) lands on it.
 */
function ShareScene() {
  return (
    <>
      <div className="f-zone">
        <Upload />
        Déposez votre livrable
      </div>
      <div className="f-desk" style={at(6, 12, 27, 0, 74)}>
        <small>Vos fichiers</small>
        <span>
          <FileText /> Charte.pdf
        </span>
        <span>
          <FileText /> Contact.png
        </span>
      </div>
      <div className="f-deliv f-pop" style={at(40, 12, 27, 1.85, 74)}>
        <span className="f-deliv-thumb">
          <span className="f-deliv-page">
            <i />
            <b>Des plantes qui durent.</b>
            <Plant />
          </span>
          <i className="f-fill" style={{ "--at": "1.9s", "--dur": "0.7s" } as React.CSSProperties} />
        </span>
        <span className="f-deliv-meta">
          <span>
            <b>Livrable</b>
            <small>Page d’accueil</small>
          </span>
          <em className="f-pop" style={when(2.5)}>
            V03
          </em>
        </span>
      </div>
      <div className="f-drag" style={at(8, 58, 22, 0, 16)}>
        <FileText />
        <span>
          Accueil.pdf
          <small>2,4 Mo</small>
        </span>
      </div>
      <div className="f-card f-rise" style={at(69, 12, 25, 2.3, 74)}>
        <small>Partager avec</small>
        <span className="f-person f-pop" style={when(2.7)}>
          <span className="f-avatar">CM</span>
          <span>
            Claire M.
            <small>Décideuse</small>
          </span>
        </span>
      </div>
      {/* The button comes in with its panel, then is pressed and gives way (one animation per element). */}
      <span className="f-slot f-rise" style={at(71, 63, 21, 2.3, 11)}>
        <span className="f-button f-press f-leave" style={{ "--at": "3.5s", "--leave": "3.8s" } as React.CSSProperties}>
          <Send /> Inviter
        </span>
      </span>
      <span className="f-done is-box f-pop" style={at(71, 63, 21, 3.8, 11)}>
        <Check /> Invitée
      </span>
      <Ripple x={81.5} y={68.5} t={3.45} />
      <Cursor />
    </>
  );
}

/** 2. The client clicks on the deliverable and writes, right there. */
function CommentScene() {
  return (
    <>
      <div className="f-page" style={at(6, 8, 88, 0, 83)}>
        <span className="f-page-copy">
          <small>northstar.</small>
          <b>Des plantes qui durent.</b>
          <span>Livrées en 48&nbsp;h, garanties un an.</span>
          <em>Découvrir</em>
        </span>
        <span className="f-page-art">
          <Plant />
        </span>
      </div>
      <Ripple x={36} y={72} t={1.15} />
      <span className="f-pin f-drop" style={at(36, 72, undefined, 1.3)}>
        CM
      </span>
      <div className="f-bubble f-pop" style={at(39, 54, undefined, 1.5)}>
        <span className="f-type" style={{ "--at": "1.8s", "--dur": "1.3s", "--steps": 41 } as React.CSSProperties}>
          Peut-on ajouter une section témoignages&nbsp;?
        </span>
        <small className="f-sent f-pop" style={when(3.6)}>
          <Check /> Envoyé à l’agence
        </small>
      </div>
      <Cursor />
    </>
  );
}

/** 3. Among the client's requests, one is out of scope: requalified, priced, and the quote flies off. */
function QuoteScene() {
  const rows: [string, number][] = [
    ["Agrandir le logo", 24],
    ["Section témoignages", 43],
    ["Corriger une coquille", 62],
  ];
  return (
    <>
      <div className="f-list" style={at(6, 10, 46, 0, 80)}>
        <small>Demandes · Accueil V03</small>
      </div>
      {rows.map(([title, y]) => (
        <span key={title} className={`f-row ${y === 43 ? "f-pick" : ""}`} style={{ ...at(8.5, y, 41, 0, 15), "--at": "1.15s" } as React.CSSProperties}>
          <span className="f-avatar">CM</span>
          {title}
        </span>
      ))}
      <span className="f-chip is-in" style={at(38.5, 27.5, 9.5, 0, 8)}>
        Inclus
      </span>
      <span className="f-chip is-ask f-leave" style={{ ...at(38.5, 46.5, 9.5, 0, 8), "--leave": "1.2s" } as React.CSSProperties}>
        À clarifier
      </span>
      <span className="f-chip is-out f-pop" style={at(38.5, 46.5, 9.5, 1.2, 8)}>
        Hors scope
      </span>
      <span className="f-chip is-in" style={at(38.5, 65.5, 9.5, 0, 8)}>
        Inclus
      </span>
      <div className="f-card f-rise" style={at(57, 10, 37, 1.6, 80)}>
        <small>Supplément · Section témoignages</small>
        <b className="f-amount">&nbsp;€ HT</b>
        <span className="f-delay f-pop" style={when(3)}>
          + <span className="f-days" /> jours
        </span>
      </div>
      <span className="f-slot f-rise" style={at(60, 66, 31, 1.6, 11)}>
        <span className="f-button f-press f-leave" style={{ "--at": "3.7s", "--leave": "4s" } as React.CSSProperties}>
          <Send /> Envoyer le devis
        </span>
      </span>
      <span className="f-done is-box f-pop" style={at(60, 66, 31, 4, 11)}>
        <Check /> Envoyé à Claire
      </span>
      <span className="f-plane" style={at(74, 68, undefined, 3.95)}>
        <Send />
      </span>
      <Ripple x={43.25} y={50.5} t={1.05} />
      <Ripple x={75.5} y={71.5} t={3.65} />
      <Cursor />
    </>
  );
}

/** 4. The client accepts (a small burst), the version turns validated, the journal records it. */
function ApproveScene() {
  const sparks = ["0deg", "45deg", "90deg", "135deg", "180deg", "225deg", "270deg", "315deg"];
  return (
    <>
      <div className="f-card is-offer" style={at(7, 12, 45, 0, 76)}>
        <small>Supplément proposé par Studio Bloom</small>
        <b>Section témoignages</b>
        <span className="f-price">
          850&nbsp;€ HT <small>· + 3 jours</small>
        </span>
        <span className="f-note">Les travaux démarrent après votre accord.</span>
      </div>
      <span className="f-button is-ghost f-leave" style={{ ...at(10, 68, 19, 0, 11), "--leave": "1.45s" } as React.CSSProperties}>
        Refuser
      </span>
      <span className="f-button f-press f-leave" style={{ ...at(30, 68, 19, 1.25, 11), "--leave": "1.45s" } as React.CSSProperties}>
        Accepter
      </span>
      <span className="f-done is-box is-strong f-pop" style={at(10, 68, 39, 1.45, 11)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5 L 10 17 L 19 7.5" pathLength="1" />
        </svg>
        Accepté · 15:05
      </span>
      <span className="f-burst" style={at(39.5, 73.5, undefined, 1.3)}>
        {sparks.map((angle) => (
          <i key={angle} style={{ "--r": angle } as React.CSSProperties} />
        ))}
      </span>
      <div className="f-version" style={at(57, 12, 36, 0, 20)}>
        <b>Accueil</b>
        <small>Version 3</small>
      </div>
      <span className="f-pill is-ask f-leave" style={{ ...at(77, 17, 13, 0, 10), "--leave": "2.1s" } as React.CSSProperties}>
        En revue
      </span>
      <span className="f-pill is-ok f-pop" style={at(77, 17, 13, 2.1, 10)}>
        <Lock /> Validée
      </span>
      <div className="f-events" style={at(57, 38, 36)}>
        <span className="is-ok f-rise" style={when(2.6)}>
          <Check /> Devis accepté par Claire
        </span>
        <span className="f-rise" style={when(3.1)}>
          <Bell /> Studio Bloom prévenu
        </span>
        <span className="f-rise" style={when(3.6)}>
          <ScrollText /> Consigné au journal
        </span>
      </div>
      <Ripple x={39.5} y={73.5} t={1.2} />
      <Cursor />
    </>
  );
}

const scenes = [ShareScene, CommentScene, QuoteScene, ApproveScene];

/** A round number that changes at each loop while `active` (never under reduced motion). */
function useRounds(active: boolean) {
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setRound((value) => value + 1), loopSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return round;
}

/**
 * The main flow in four short scenes made of Kora's interface, all visible at once and playing
 * together while on screen, one a little after the other, then again; a button pauses them.
 * Under reduced motion they do not play: each shows its last frame.
 */
export function Film() {
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const playing = inView && !paused;
  // Each round remounts the scenes (new keys): their animations play again from the start.
  const round = useRounds(playing);

  useEffect(() => {
    const node = root.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.3 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={root} className="lp-film" data-playing={playing ? "" : undefined}>
      <div className="lp-film-head">
        <h2 id="lp-film-title">Kora en quatre gestes</h2>
        <button
          type="button"
          className="lp-film-toggle"
          aria-label={paused ? "Lire les animations" : "Mettre les animations en pause"}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? <Play /> : <Pause />}
        </button>
      </div>
      <ol className="lp-moves" aria-labelledby="lp-film-title">
        {moves.map((move, index) => {
          const Scene = scenes[index];
          return (
            <li key={move.name} className={`lp-move tone-${index}`} style={{ "--lag": `${index * 0.35}s` } as React.CSSProperties}>
              <div className="lp-move-tile">
                <div key={round} className={`lp-move-scene is-${index}`} aria-hidden="true">
                  <Scene />
                </div>
              </div>
              <div className="lp-move-text">
                <span className="lp-move-n">{index + 1}</span>
                <h3>{move.name}</h3>
                <p>{move.caption}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The four scenes one after the other in a single tile, with the step under it (the sign-in pages). */
export function FilmLoop() {
  const round = useRounds(true);
  const index = round % scenes.length;
  const Scene = scenes[index];
  return (
    <div className="lp-film auth-film" data-playing="">
      <div className={`lp-move tone-${index}`}>
        <div className="lp-move-tile">
          <div key={round} className={`lp-move-scene is-${index}`} aria-hidden="true">
            <Scene />
          </div>
        </div>
        <div className="lp-move-text">
          <span className="lp-move-n">{index + 1}</span>
          <h3>{moves[index].name}</h3>
          <p>{moves[index].caption}</p>
        </div>
      </div>
    </div>
  );
}
