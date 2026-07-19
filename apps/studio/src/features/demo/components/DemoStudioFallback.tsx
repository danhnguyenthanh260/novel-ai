"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import styles from "./demo-studio-fallback.module.css";

type DemoTab = "draft" | "outline" | "publish" | "signals";

const chapters = [
  { number: 10, title: "The City That Listens", words: "3,860", status: "Revised" },
  { number: 11, title: "A Map of Quiet Things", words: "4,120", status: "Revised" },
  { number: 12, title: "The Shape Beneath", words: "2,940", status: "Drafting" },
  { number: 13, title: "Salt in the Signal", words: "—", status: "Outlined" },
];

const tabs: Array<{ id: DemoTab; label: string }> = [
  { id: "draft", label: "Draft" },
  { id: "outline", label: "Story map" },
  { id: "publish", label: "Publish" },
  { id: "signals", label: "Reader signals" },
];

export default function DemoStudioFallback() {
  const [tab, setTab] = useState<DemoTab>("draft");
  const [chapter, setChapter] = useState(2);
  const [suggestionVisible, setSuggestionVisible] = useState(false);

  return (
    <main className={styles.demo} data-testid="demo-workspace">
      <div className={styles.demoBanner}>
        <div>
          <span className={styles.liveDot} />
          <strong>Interactive demo</strong>
          <span>Sample story data is loaded because the production database is not connected.</span>
        </div>
        <span>Changes stay in this browser session</span>
      </div>

      <div className={styles.workspaceHeader}>
        <div>
          <span className={styles.kicker}>ACTIVE MANUSCRIPT</span>
          <h1>The Subcurrent</h1>
          <p>Literary science fiction · 54,280 words · Draft 3</p>
        </div>
        <nav aria-label="Demo workspace views" className={styles.tabs}>
          {tabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? styles.activeTab : ""}
              onClick={() => setTab(item.id)}
              data-testid={`demo-tab-${item.id}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "draft" && (
        <DraftWorkspace
          chapter={chapter}
          onChapterChange={setChapter}
          suggestionVisible={suggestionVisible}
          onGenerate={() => setSuggestionVisible(true)}
        />
      )}
      {tab === "outline" && <StoryMap />}
      {tab === "publish" && <PublishView />}
      {tab === "signals" && <ReaderSignals />}
    </main>
  );
}

function DraftWorkspace({
  chapter,
  onChapterChange,
  suggestionVisible,
  onGenerate,
}: {
  chapter: number;
  onChapterChange: (chapter: number) => void;
  suggestionVisible: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className={styles.draftGrid}>
      <aside className={styles.chapterRail}>
        <div className={styles.panelTitle}>CHAPTERS <span>13 total</span></div>
        {chapters.map((item, index) => (
          <button
            key={item.number}
            className={index === chapter ? styles.activeChapter : styles.chapter}
            onClick={() => onChapterChange(index)}
          >
            <span>{String(item.number).padStart(2, "0")}</span>
            <div><strong>{item.title}</strong><small>{item.words} words · {item.status}</small></div>
          </button>
        ))}
        <div className={styles.memoryHealth}>
          <span>STORY MEMORY</span>
          <strong>128 facts synced</strong>
          <div><i style={{ width: "92%" }} /></div>
          <small>Continuity health 92%</small>
        </div>
      </aside>

      <section className={styles.editor}>
        <div className={styles.editorMeta}>
          <span>CHAPTER {chapters[chapter].number} · {chapters[chapter].status.toUpperCase()}</span>
          <span>Saved just now</span>
        </div>
        <h2>{chapters[chapter].title}</h2>
        {chapter === 2 ? (
          <div className={styles.prose}>
            <p className={styles.lead}>Mara heard the ocean before she saw it. Not the familiar crash of water against the city wall, but a low electrical thrum moving through the pipes beneath her feet.</p>
            <p>She placed one palm against the cold metal. The signal answered—not in words, but in the borrowed rhythm of a heartbeat she remembered from another life.</p>
            {suggestionVisible && (
              <div className={styles.suggestion} data-testid="demo-suggestion">
                <div><span>AI CO-AUTHOR</span><strong>Continuity-aware next beat</strong></div>
                <p>Connect the three-beat signal to the brass key introduced in Chapter 3. Mara recognizes its pattern and realizes the city has been listening to her all along.</p>
                <div><Button size="sm" onClick={() => undefined}>Accept into draft</Button><button>Try another</button></div>
              </div>
            )}
            <p>The lights along the corridor blinked once, then twice. Mara closed her eyes and waited for the third pulse.</p>
          </div>
        ) : (
          <div className={styles.chapterPreview}>
            <span>{chapters[chapter].status}</span>
            <p>Select Chapter 12 to explore the interactive AI co-writing demo.</p>
            <button onClick={() => onChapterChange(2)}>Open The Shape Beneath →</button>
          </div>
        )}
        <div className={styles.editorFooter}><span>{chapters[chapter].words} words</span><span>Reading time 14 min</span><span>Voice match 94%</span></div>
      </section>

      <aside className={styles.copilot}>
        <div className={styles.panelTitle}>STORY INTELLIGENCE <span>LIVE</span></div>
        <div className={styles.contextCard}><span>SCENE GOAL</span><p>Mara discovers the city can recognize and answer her memories.</p></div>
        <div className={styles.contextCard}><span>OPEN THREAD</span><p>Why does the seawall know Mara&apos;s heartbeat?</p></div>
        <div className={styles.contextCard}><span>EMOTIONAL ARC</span><p>Isolation → cautious belonging</p></div>
        <div className={styles.guardrail}><strong>Canon guard</strong><span>0 conflicts detected</span></div>
        <Button className={styles.generateButton} onClick={onGenerate} data-testid="demo-generate">
          {suggestionVisible ? "Regenerate next beat" : "Generate next beat"}
        </Button>
        <p className={styles.provider}>Gemini 2.5 Flash · Story memory on</p>
      </aside>
    </div>
  );
}

function StoryMap() {
  const beats = ["The signal awakens", "Mara follows the pipes", "The city remembers", "A choice at the seawall"];
  return (
    <section className={styles.surface}>
      <div className={styles.surfaceIntro}><span>STORY MAP</span><h2>Chapter 12 narrative arc</h2><p>A living outline keeps every scene aligned with character goals, canon, and reader promises.</p></div>
      <div className={styles.beatFlow}>{beats.map((beat, index) => <article key={beat}><span>BEAT 0{index + 1}</span><strong>{beat}</strong><small>{index < 3 ? "Ready" : "Needs decision"}</small></article>)}</div>
      <div className={styles.mapStats}><Metric label="Setup threads" value="3" /><Metric label="Payoffs" value="2" /><Metric label="Canon conflicts" value="0" /><Metric label="Arc confidence" value="91%" /></div>
    </section>
  );
}

function PublishView() {
  return (
    <section className={styles.surface}>
      <div className={styles.surfaceIntro}><span>PUBLISHING DESK</span><h2>Ready for early readers</h2><p>One workflow turns the manuscript into web, EPUB, and print-ready editions.</p></div>
      <div className={styles.publishGrid}>
        <div className={styles.bookCover}><small>A NOVEL</small><strong>THE<br />SUBCURRENT</strong><span>NGUYỄN THÀNH DANH</span></div>
        <div className={styles.releasePanel}><span>RELEASE CHECKLIST · 4/5</span><h3>Draft 3 Preview</h3><ul><li>✓ Editorial pass complete</li><li>✓ Voice consistency checked</li><li>✓ EPUB and web layouts ready</li><li>✓ Distribution metadata ready</li><li>○ Author approval pending</li></ul><Button>Preview release</Button></div>
        <div className={styles.channelPanel}><Metric label="Preview readers" value="1,284" /><Metric label="Completion" value="63%" /><Metric label="Early rating" value="4.7" /></div>
      </div>
    </section>
  );
}

function ReaderSignals() {
  return (
    <section className={styles.surface}>
      <div className={styles.surfaceIntro}><span>READER SIGNALS</span><h2>Listen without losing your voice</h2><p>Behavior becomes creative evidence. The author remains in control of every change.</p></div>
      <div className={styles.signalGrid}>
        <div className={styles.chart}><span>CHAPTER COMPLETION</span><div>{[64,72,79,75,88,91,84,94,78,89,96,63].map((height, index) => <i key={index} style={{ height: `${height}%` }}><small>{index + 1}</small></i>)}</div><p>Chapter 12 has strong anticipation but a sharp transition before the reveal.</p></div>
        <blockquote>“I need to know what the city has been hiding from Mara.”<small>Dominant reader emotion · Anticipation</small></blockquote>
        <div className={styles.market}><span>EARLY ADOPTER</span><h3>Mai, 23 · Serial-fiction writer</h3><p>Three unfinished fantasy drafts. Publishes online after work and needs structure without surrendering creative control.</p><strong>“Help me finish the book I can already imagine.”</strong></div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>;
}
