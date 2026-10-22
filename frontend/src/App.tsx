import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

type DocumentItem = { filename: string; chunks: number };
type SourceItem = { filename: string; passage: string };
type AskResponse = { question: string; answer: string; sources: SourceItem[] };
type HealthResponse = {
  api?: string;
  ollama?: string;
  model?: string;
  model_available?: boolean;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

async function readError(response: Response) {
  try {
    const data = await response.json();
    return data.detail || data.message || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [busyUpload, setBusyUpload] = useState(false);
  const [busyAsk, setBusyAsk] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<"workspace" | "documents">("workspace");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshHealth = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/health`);
      if (!response.ok) throw new Error("Health check failed");
      setHealth(await response.json());
    } catch {
      setHealth({ api: "disconnected", ollama: "unknown", model_available: false });
    }
  }, []);

  const refreshDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const response = await fetch(`${API_BASE}/documents`);
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load documents.");
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
    void refreshDocuments();
    const interval = window.setInterval(() => void refreshHealth(), 15000);
    return () => window.clearInterval(interval);
  }, [refreshHealth, refreshDocuments]);

  async function uploadDocument() {
    if (!file) {
      setError("Choose a PDF or TXT file first.");
      return;
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".pdf") && !lower.endsWith(".txt")) {
      setError("Only PDF and TXT files are supported.");
      return;
    }
    setError("");
    setNotice("");
    setBusyUpload(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setNotice(`${data.filename} uploaded successfully · ${data.chunks_created} text chunks created.`);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refreshDocuments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Check that FastAPI is running.");
    } finally {
      setBusyUpload(false);
    }
  }

  async function askQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) {
      setError("Enter a question before asking.");
      return;
    }
    setError("");
    setNotice("");
    setBusyAsk(true);
    try {
      const response = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setResult(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get an answer. Check FastAPI and Ollama.");
    } finally {
      setBusyAsk(false);
    }
  }

  const connected = health?.api === "ok";
  const ollamaConnected = health?.ollama === "connected" && health?.model_available !== false;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Knowledge Assistant home">
          <span className="brand-mark">K</span>
          <span><strong>Knowledge</strong><small>ASSISTANT</small></span>
        </a>

        <div className="side-label">WORKSPACE</div>
        <button className={`nav-item ${activeTab === "workspace" ? "active" : ""}`} onClick={() => setActiveTab("workspace")}>
          <span className="nav-icon">✳</span> AI workspace
        </button>
        <button className={`nav-item ${activeTab === "documents" ? "active" : ""}`} onClick={() => setActiveTab("documents")}>
          <span className="nav-icon">▤</span> Documents <span className="nav-count">{documents.length}</span>
        </button>

        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="local-icon">⌁</span>
            <div><strong>Private by design</strong><p>Your model runs locally through Ollama.</p></div>
          </div>
          <div className="side-status"><span className={`status-dot ${connected ? "online" : "offline"}`} /> API {connected ? "connected" : "disconnected"}</div>
        </div>
      </aside>

      <main className="main-area" id="top">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">K</span><strong>Knowledge Assistant</strong></div>
          <div className="breadcrumbs">Workspace <span>/</span> <strong>{activeTab === "workspace" ? "AI assistant" : "Documents"}</strong></div>
          <div className="topbar-right">
            <span className={`connection-pill ${connected ? "good" : "bad"}`}><span className="status-dot" />{connected ? "API connected" : "API offline"}</span>
            <span className={`connection-pill ${ollamaConnected ? "good" : "warn"}`}><span className="status-dot" />{ollamaConnected ? "Local AI ready" : "Check Ollama"}</span>
          </div>
        </header>

        <div className="content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> YOUR LOCAL AI WORKSPACE</div>
              <h1>{activeTab === "workspace" ? <>Your knowledge.<br /><span>One clear answer.</span></> : <>Your company<br /><span>knowledge library.</span></>}</h1>
              <p className="welcome-copy">Ask questions across your company documents. Get helpful answers with the source passages right beside them.</p>
            </div>
            <div className="welcome-art" aria-hidden="true">
              <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
              <div className="art-document"><span /><span /><span /><i>✦</i></div>
              <div className="art-spark spark-one">✦</div><div className="art-spark spark-two">✧</div>
            </div>
          </section>

          {error && <div className="alert error-alert" role="alert"><span>!</span><div>{error}</div><button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
          {notice && <div className="alert success-alert" role="status"><span>✓</span><div>{notice}</div><button onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}

          {activeTab === "workspace" ? (
            <div className="workspace-grid">
              <section className="panel upload-panel">
                <div className="panel-heading">
                  <div className="heading-icon purple-icon">↑</div>
                  <div><h2>Knowledge library</h2><p>Add documents to your assistant</p></div>
                </div>
                <div className="drop-zone" onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}>
                  <div className="upload-symbol">↑</div>
                  <strong>{file ? file.name : "Choose a document"}</strong>
                  <p>{file ? `${(file.size / 1024).toFixed(0)} KB · Ready to upload` : "PDF or TXT · Select a file from your computer"}</p>
                  <span className="browse-link">Browse files</span>
                  <input ref={fileInputRef} type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(e) => setFile(e.target.files?.[0] || null)} onClick={(e) => e.stopPropagation()} />
                </div>
                <button className="primary-button full-button" onClick={() => void uploadDocument()} disabled={busyUpload || !file}>
                  {busyUpload ? <><span className="spinner" /> Uploading document…</> : "Upload document"} <span>↗</span>
                </button>

                <div className="section-title-row">
                  <div><h3>Uploaded documents</h3><p>{documents.length} {documents.length === 1 ? "document" : "documents"} in your library</p></div>
                  <button className="text-button" onClick={() => void refreshDocuments()} disabled={loadingDocs}>{loadingDocs ? "Loading…" : "Refresh ↻"}</button>
                </div>
                <DocumentList documents={documents} />
                <p className="storage-note"><span>ⓘ</span> Document chunks are held in backend memory and will clear when FastAPI restarts.</p>
              </section>

              <section className="panel assistant-panel">
                <div className="panel-heading assistant-heading">
                  <div className="heading-icon violet-icon">✳</div>
                  <div><h2>Ask your assistant</h2><p>Answers grounded in your uploaded documents</p></div>
                  <span className="model-tag"><span className="status-dot online" /> {health?.model || "Local model"}</span>
                </div>

                <form onSubmit={askQuestion} className="question-form">
                  <label htmlFor="question">What would you like to know?</label>
                  <textarea id="question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="For example: How many days of annual leave do employees receive?" rows={4} />
                  <div className="form-footer"><span>Be specific for the most relevant answer.</span><button className="primary-button ask-button" type="submit" disabled={busyAsk}>{busyAsk ? <><span className="spinner" /> Thinking…</> : <>Ask assistant <span>→</span></>}</button></div>
                </form>

                {result ? (
                  <div className="answer-card">
                    <div className="answer-header"><div className="answer-label"><span className="answer-spark">✦</span><div><strong>ANSWER</strong><small>Generated by your local AI</small></div></div><button className="icon-button" title="Copy answer" onClick={() => void navigator.clipboard?.writeText(result.answer)}>⧉</button></div>
                    <div className="asked-question"><span>YOUR QUESTION</span><p>{result.question}</p></div>
                    <div className="answer-text">{result.answer}</div>
                    <div className="sources-section">
                      <div className="sources-heading"><div><h3>Sources</h3><p>Passages returned by document retrieval</p></div><span className="source-count">{result.sources?.length || 0}</span></div>
                      {result.sources?.length ? result.sources.map((source, index) => <article className="source-card" key={`${source.filename}-${index}`}><div className="source-file"><span className="file-mini">▤</span><strong>{source.filename}</strong><span className="source-index">SOURCE {index + 1}</span></div><p>{source.passage}</p></article>) : <div className="no-sources"><span>ⓘ</span><p>No document passages were returned for this answer. It may have been generated from general knowledge or the uploaded documents may not contain a matching passage.</p></div>}
                    </div>
                  </div>
                ) : (
                  <div className="empty-answer">
                    <div className="empty-illustration"><span className="empty-star">✦</span><div className="empty-paper"><i /><i /><i /></div><span className="empty-dot" /></div>
                    <h3>Your answers will appear here</h3>
                    <p>Ask a question to get a clear response, with matching source passages when available.</p>
                    <div className="suggestions"><button onClick={() => setQuestion("What does the uploaded document explain?")}>Summarize a document <span>↗</span></button><button onClick={() => setQuestion("How many days of annual leave do employees receive?")}>Ask about company leave <span>↗</span></button></div>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <section className="panel library-page">
              <div className="library-heading"><div><h2>Document library</h2><p>Manage the documents currently available to your assistant.</p></div><button className="primary-button" onClick={() => { setActiveTab("workspace"); fileInputRef.current?.click(); }}>+ Add document</button></div>
              <DocumentList documents={documents} />
              {!documents.length && <div className="library-empty"><div className="upload-symbol">▤</div><h3>Your library is empty</h3><p>Upload a PDF or TXT file from the AI workspace to get started.</p><button className="primary-button" onClick={() => setActiveTab("workspace")}>Go to workspace</button></div>}
              <p className="storage-note"><span>ⓘ</span> The current backend keeps document chunks in memory. This list reflects the backend's current session.</p>
            </section>
          )}

          <footer className="footer"><span>Knowledge Assistant</span><span>Private workspace · Powered by local Ollama</span></footer>
        </div>
      </main>
    </div>
  );
}

function DocumentList({ documents }: { documents: DocumentItem[] }) {
  if (!documents.length) return <div className="document-empty"><span>▤</span><div><strong>No documents yet</strong><p>Upload your first PDF or TXT file above.</p></div></div>;
  return <div className="document-list">{documents.map((doc) => <div className="document-row" key={doc.filename}><div className="document-file-icon">▤</div><div className="document-info"><strong title={doc.filename}>{doc.filename}</strong><p>{doc.chunks} text {doc.chunks === 1 ? "chunk" : "chunks"}</p></div><span className="document-ready" title="Available to the backend">✓</span></div>)}</div>;
}

export default App;
