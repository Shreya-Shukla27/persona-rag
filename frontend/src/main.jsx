import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUp,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  FileText,
  FolderOpen,
  Gauge,
  GitCompareArrows,
  LogOut,
  LockKeyhole,
  Mail,
  Mic,
  MessageCircle,
  Moon,
  Plus,
  Paperclip,
  Grid2X2,
  List,
  SlidersHorizontal,
  ArrowDownAZ,
  Eye,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const fallbackPersonas = [
  { name: 'Grumpy Expert', emoji: '😤', tagline: 'Knows the material cold, mildly annoyed you\'re asking.' },
  { name: 'Socratic Tutor', emoji: '🤔', tagline: 'Guides you toward the answer with questions, not lectures.' },
  { name: 'Pirate Librarian', emoji: '🏴‍☠️', tagline: 'Nautical flavor, but a stickler for citing real sources.' },
  { name: 'Plain & Neutral', emoji: '📄', tagline: 'No flavor, just clear answers from your documents.' },
];

const formatBytes = (bytes) => {
  if (!bytes) return 'Size unavailable';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const documentType = (name) => name.split('.').pop()?.toUpperCase() || 'FILE';

function DocumentCard({ document, metadata, layout, onOpen, collection, collectionOptions, onCollectionChange }) {
  const type = metadata.type || documentType(document.name);
  const status = metadata.status || 'Ready';
  return (
    <button className={`library-document ${layout}`} onClick={() => onOpen(document.name)}>
      <div className="library-document-top"><div className={`file-badge ${type.toLowerCase()}`}>{type.slice(0, 4)}</div><span className={`status-chip ${status.toLowerCase()}`}>{status}</span></div>
      <strong>{document.name}</strong>
      <div className="document-facts"><span>{type}</span><span>{formatBytes(metadata.size)}</span>{metadata.chunks ? <span>{metadata.chunks} chunks</span> : <span>Chunks unavailable</span>}</div>
      <div className="library-document-footer"><span>{metadata.uploadedAt ? new Date(metadata.uploadedAt).toLocaleDateString() : 'Date unavailable'}</span><Eye size={14} /></div>
      <select className="document-collection-select" value={collection} onClick={(event) => event.stopPropagation()} onChange={(event) => onCollectionChange(document.name, event.target.value)} aria-label={`Collection for ${document.name}`}>{collectionOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
    </button>
  );
}

function App() {
  const [personas, setPersonas] = useState(fallbackPersonas);
  const [persona, setPersona] = useState(fallbackPersonas[0]);
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => new URLSearchParams(window.location.search).has('workspace'));
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const [activeView, setActiveView] = useState('dashboard');
  const [documentMeta, setDocumentMeta] = useState({});
  const [documentQuery, setDocumentQuery] = useState('');
  const [documentFilter, setDocumentFilter] = useState('all');
  const [documentSort, setDocumentSort] = useState('recent');
  const [documentLayout, setDocumentLayout] = useState('grid');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [uploadStage, setUploadStage] = useState(null);
  const [selectedSource, setSelectedSource] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const sourceRefs = useRef({});
  const [conversationHistory, setConversationHistory] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState('current');
  const [collectionMap, setCollectionMap] = useState({});
  const [collectionFilter, setCollectionFilter] = useState('All documents');
  const [collectionScope, setCollectionScope] = useState('All documents');
  const [compareSelection, setCompareSelection] = useState([]);
  const [compareQuestion, setCompareQuestion] = useState('What are the key differences between these documents?');
  const [compareAnswer, setCompareAnswer] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [generationState, setGenerationState] = useState('idle');
  const generationControllerRef = useRef(null);
  const [apiStatus, setApiStatus] = useState('checking');
  const [failedQuestion, setFailedQuestion] = useState('');
  const collectionOptions = ['All documents', 'Research', 'Projects', 'College', 'Career', 'Personal', 'Uncategorized'];

  const loadWorkspaceData = () => {
    setApiStatus('checking');
    return Promise.all([fetch(`${API_URL}/api/personas`), fetch(`${API_URL}/api/documents`)]).then(async ([personaResponse, documentResponse]) => {
      if (!personaResponse.ok || !documentResponse.ok) throw new Error('Workspace API is unavailable.');
      if (personaResponse.ok) {
        const remotePersonas = await personaResponse.json();
        setPersonas(remotePersonas);
        setPersona(remotePersonas[0]);
      }
      if (documentResponse.ok) {
        const remoteDocuments = (await documentResponse.json()).documents;
        setDocuments(remoteDocuments);
        setCollectionMap((current) => Object.fromEntries(remoteDocuments.map((document) => [document.name, current[document.name] || 'Uncategorized'])));
        setDocumentMeta((current) => Object.fromEntries(remoteDocuments.map((document) => [document.name, current[document.name] || { status: 'Ready' }])));
      }
      setApiStatus('connected');
      setError('');
    }).catch(() => {
      setApiStatus('offline');
      setError('The workspace API is disconnected. Start the backend, then retry.');
    });
  };

  useEffect(() => {
    loadWorkspaceData();
  }, []);

  const uploadDocuments = async (event) => {
    const files = [...event.target.files];
    if (!files.length) return;
    setError('');
    setIsUploading(true);
    const body = new FormData();
    files.forEach((file) => body.append('files', file));
    setUploadQueue(files.map((file) => ({ name: file.name, size: file.size, type: file.type || 'Unknown', status: 'Uploading' })));
    setUploadStage('Uploading');
    try {
      const response = await fetch(`${API_URL}/api/documents/upload`, { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Upload failed');
      const uploadedByName = Object.fromEntries((data.uploaded || []).map((item) => [item.name, item]));
      setDocumentMeta((current) => ({
        ...current,
        ...Object.fromEntries(files.map((file) => [file.name, {
          ...current[file.name],
          size: file.size,
          type: file.type || file.name.split('.').pop()?.toUpperCase() || 'Unknown',
          chunks: uploadedByName[file.name]?.chunks,
          status: 'Ready',
          uploadedAt: new Date().toISOString(),
        }])),
      }));
      setUploadQueue(files.map((file) => ({ name: file.name, size: file.size, type: file.type || 'Unknown', status: 'Indexed' })));
      setUploadStage('Indexed');
      setDocuments(data.documents.map((name) => ({ name })));
      setCollectionMap((current) => Object.fromEntries(data.documents.map((name) => [name, current[name] || 'Uncategorized'])));
    } catch (uploadError) {
      setError(uploadError.message);
      setUploadStage('Error');
      setUploadQueue(files.map((file) => ({ name: file.name, size: file.size, type: file.type || 'Unknown', status: 'Error' })));
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const clearDocuments = async () => {
    await fetch(`${API_URL}/api/documents`, { method: 'DELETE' });
    setDocuments([]);
    setDocumentMeta({});
    setCollectionMap({});
    setUploadQueue([]);
    setUploadStage(null);
    setSelectedDocument(null);
  };

  const submitQuestion = async (question) => {
    if (!question || isLoading) return;
    const requestStartedAt = performance.now();
    const controller = new AbortController();
    generationControllerRef.current = controller;
    setDraft('');
    setError('');
    const nextMessages = [...messages, { role: 'user', content: question }];
    setMessages(nextMessages);
    setIsLoading(true);
    setGenerationState('generating');
    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, persona: persona.name, api_key: apiKey || null, chat_history: nextMessages.slice(-8) }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not answer that question');
      setMessages([...nextMessages, { role: 'assistant', content: data.answer, sources: data.sources, usedContext: data.used_context, responseMs: Math.round(performance.now() - requestStartedAt) }]);
      setFailedQuestion('');
      setGenerationState('idle');
    } catch (chatError) {
      if (chatError.name === 'AbortError') {
        setGenerationState('stopped');
      } else {
        setFailedQuestion(question);
        setError(`RAG answer failed: ${chatError.message}`);
        setGenerationState('idle');
      }
    } finally {
      setIsLoading(false);
      generationControllerRef.current = null;
    }
  };

  const stopGeneration = () => {
    if (generationControllerRef.current) generationControllerRef.current.abort();
  };

  const askQuestion = async (event) => {
    event?.preventDefault();
    await submitQuestion(draft.trim());
  };

  const speak = (text) => {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  const startVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice input is not supported by this browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => setDraft((current) => `${current} ${event.results[0][0].transcript}`.trim());
    recognition.onerror = () => setError('Voice input could not be started. Please try again.');
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const focusSource = (source, index) => {
    setSelectedSource(source);
    setPreviewLoading(true);
    window.setTimeout(() => setPreviewLoading(false), 250);
    window.setTimeout(() => sourceRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
  };

  const handleLogin = (event) => {
    event.preventDefault();
    setIsAuthenticated(true);
  };

  const assignCollection = (documentName, collection) => {
    setCollectionMap((current) => ({ ...current, [documentName]: collection }));
  };

  const startNewConversation = () => {
    if (messages.length) {
      const firstQuestion = messages.find((message) => message.role === 'user');
      setConversationHistory((current) => [{ id: `conversation-${Date.now()}`, title: firstQuestion?.content || 'Untitled conversation', timestamp: new Date().toISOString(), messages }, ...current]);
    }
    setMessages([]);
    setActiveConversationId('current');
    setActiveView('dashboard');
  };

  const openConversation = (conversation) => {
    setMessages(conversation.messages);
    setActiveConversationId(conversation.id);
    setActiveView('dashboard');
  };

  const toggleCompareDocument = (documentName) => {
    setCompareSelection((current) => current.includes(documentName) ? current.filter((name) => name !== documentName) : [...current, documentName]);
  };

  const generateComparison = async (event) => {
    event?.preventDefault();
    if (compareSelection.length < 2 || !compareQuestion.trim() || compareLoading) return;
    setCompareLoading(true);
    setError('');
    const requestStartedAt = performance.now();
    const scopeInstruction = `Compare only the selected documents: ${compareSelection.join(', ')}. ${compareQuestion.trim()} Use these headings when supported by the documents: OVERVIEW, METHODOLOGY, KEY FINDINGS, RESULTS, LIMITATIONS, IMPORTANT DIFFERENCES. Cite factual claims inline with the source order as [1], [2], etc. Do not invent differences or sections not supported by the retrieved context.`;
    try {
      const response = await fetch(`${API_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: scopeInstruction, persona: persona.name, api_key: apiKey || null, chat_history: [] }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not generate comparison');
      setCompareAnswer({ answer: data.answer, sources: data.sources || [], usedContext: data.used_context, responseMs: Math.round(performance.now() - requestStartedAt) });
    } catch (compareError) {
      setError(compareError.message);
    } finally {
      setCompareLoading(false);
    }
  };

  const visibleDocuments = documents
    .filter((document) => document.name.toLowerCase().includes(documentQuery.toLowerCase()))
    .filter((document) => collectionFilter === 'All documents' || (collectionMap[document.name] || 'Uncategorized') === collectionFilter)
    .filter((document) => documentFilter === 'all' || (documentMeta[document.name]?.status || 'Ready').toLowerCase() === documentFilter)
    .sort((a, b) => documentSort === 'name'
      ? a.name.localeCompare(b.name)
      : (new Date(documentMeta[b.name]?.uploadedAt || 0).getTime() - new Date(documentMeta[a.name]?.uploadedAt || 0).getTime()));

  const renderDocumentsView = () => (
    <section className="content documents-page">
      {apiStatus === 'offline' && <div className="state-banner offline"><span><strong>API disconnected</strong><small>Documents cannot be refreshed until the backend is available.</small></span><button onClick={loadWorkspaceData}>Retry connection</button></div>}
      <div className="documents-header"><div><span className="eyebrow"><span className="eyebrow-line" /> KNOWLEDGE LIBRARY</span><h1>Documents</h1><p>Manage everything your assistant knows.</p></div><label className="primary-upload"><Upload size={16} /> Upload documents<input type="file" accept=".pdf,.txt,.md" multiple onChange={uploadDocuments} /></label></div>
      {uploadQueue.length > 0 && uploadStage && <div className={`processing-pipeline ${uploadStage.toLowerCase()}`}><div className="processing-pipeline-head"><div><span className="eyebrow">PROCESSING STATUS</span><strong>{uploadStage === 'Error' ? 'Document processing failed' : uploadStage === 'Indexed' ? 'Document indexed successfully' : 'Uploading document'}</strong></div><span className={`status-chip ${uploadStage.toLowerCase()}`}>{uploadStage}</span></div><div className="processing-steps">{['Uploading', 'Processing', 'Chunking', 'Embedding', 'Indexed'].map((step) => <span className={step === uploadStage ? 'current' : step === 'Indexed' && uploadStage === 'Indexed' ? 'complete' : 'pending'} key={step}>{step}</span>)}</div>{uploadStage === 'Error' && <small className="processing-error">{error}</small>}{uploadStage !== 'Indexed' && uploadStage !== 'Error' && <small className="processing-note">Detailed backend stage updates are not exposed; intermediate steps remain pending until indexing completes.</small>}</div>}
      <div className="collections-bar"><span className="eyebrow">COLLECTION</span><select value={collectionFilter} onChange={(event) => setCollectionFilter(event.target.value)}>{collectionOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><span className="collection-note">Organizing is session-only until collection support is added to the backend.</span></div>
      {uploadQueue.length > 0 && uploadStage && uploadStage !== 'Ready' && <div className={`upload-progress ${uploadStage.toLowerCase()}`}><div className="upload-progress-icon"><Upload size={16} /></div><div><strong>{uploadStage === 'Error' ? 'Upload could not be completed' : `${uploadStage} ${uploadQueue.length} document${uploadQueue.length === 1 ? '' : 's'}`}</strong><span>{uploadStage === 'Uploading' ? 'Sending your files securely…' : uploadStage === 'Processing' ? 'Reading file contents and preparing chunks…' : uploadStage === 'Indexing' ? 'Adding document chunks to your knowledge base…' : error}</span></div><span className={`status-chip ${uploadStage.toLowerCase()}`}>{uploadStage}</span></div>}
      <div className="document-toolbar"><label className="document-search"><Search size={16} /><input value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} placeholder="Search documents..." /></label><div className="document-controls"><label className="control-select"><SlidersHorizontal size={14} /><select value={documentFilter} onChange={(event) => setDocumentFilter(event.target.value)}><option value="all">All statuses</option><option value="ready">Ready</option><option value="processing">Processing</option><option value="error">Error</option></select></label><label className="control-select"><ArrowDownAZ size={14} /><select value={documentSort} onChange={(event) => setDocumentSort(event.target.value)}><option value="recent">Recently added</option><option value="name">Name A–Z</option></select></label><div className="view-toggle"><button className={documentLayout === 'grid' ? 'selected' : ''} onClick={() => setDocumentLayout('grid')} title="Grid view"><Grid2X2 size={15} /></button><button className={documentLayout === 'list' ? 'selected' : ''} onClick={() => setDocumentLayout('list')} title="List view"><List size={16} /></button></div></div></div>
      {visibleDocuments.length ? <div className={`document-library ${documentLayout}`}>
        {visibleDocuments.map((document) => <DocumentCard key={document.name} document={document} metadata={documentMeta[document.name] || {}} layout={documentLayout} onOpen={setSelectedDocument} collection={collectionMap[document.name] || 'Uncategorized'} collectionOptions={collectionOptions.slice(1)} onCollectionChange={assignCollection} />)}
      </div> : <div className="documents-empty"><div className="documents-empty-icon"><FolderOpen size={24} /></div><h2>{documents.length ? 'No matching documents' : 'Your knowledge base is empty.'}</h2><p>{documents.length ? 'Try a different search or status filter.' : 'Upload a document to start asking grounded questions.'}</p>{documents.length ? <button className="secondary-action" onClick={() => { setDocumentQuery(''); setDocumentFilter('all'); }}>Clear filters</button> : <label className="primary-upload empty-upload"><Upload size={16} /> Upload document<input type="file" accept=".pdf,.txt,.md" multiple onChange={uploadDocuments} /></label>}</div>}
      {selectedDocument && <div className="document-detail-backdrop" onClick={() => setSelectedDocument(null)}><aside className="document-detail" onClick={(event) => event.stopPropagation()}><div className="detail-header"><div><span className="eyebrow">DOCUMENT DETAILS</span><h2>{selectedDocument}</h2></div><button className="round-button" onClick={() => setSelectedDocument(null)}><X size={16} /></button></div><div className="detail-file-preview"><FileText size={31} /><span>{documentType(selectedDocument)} file</span></div><div className="detail-facts"><div><span>STATUS</span><b>{documentMeta[selectedDocument]?.status || 'Ready'}</b></div><div><span>SIZE</span><b>{formatBytes(documentMeta[selectedDocument]?.size)}</b></div><div><span>CHUNKS</span><b>{documentMeta[selectedDocument]?.chunks || 'Unavailable'}</b></div><div><span>UPLOADED</span><b>{documentMeta[selectedDocument]?.uploadedAt ? new Date(documentMeta[selectedDocument].uploadedAt).toLocaleDateString() : 'Unavailable'}</b></div></div><p className="detail-note">This document is available to the retrieval engine. Ask a question from the workspace to see the exact source passages used in an answer.</p></aside></div>}
    </section>
  );

  const renderWorkspaceView = () => {
    const currentAnswer = [...messages].reverse().find((message) => message.role === 'assistant');
    const currentQuestion = [...messages].reverse().find((message) => message.role === 'user');
    const currentSources = currentAnswer?.sources || [];
    const sourceToPreview = selectedSource;
    const sourceDocuments = documents.filter((document) => document.name.toLowerCase().includes(documentQuery.toLowerCase())).filter((document) => collectionScope === 'All documents' || (collectionMap[document.name] || 'Uncategorized') === collectionScope);
    const copyAnswer = () => currentAnswer && navigator.clipboard?.writeText(currentAnswer.content);
    const citationClass = (source) => sourceToPreview === source ? 'selected' : '';

    return <section className="workspace-page">
      {apiStatus === 'offline' && <div className="state-banner offline"><span><strong>API disconnected</strong><small>Persona cannot load documents or generate answers until the backend is available.</small></span><button onClick={loadWorkspaceData}>Retry connection</button><button onClick={() => setActiveView('documents')}>Go to Documents</button></div>}
      {generationState === 'generating' && <div className="generation-banner"><span className="spinner" /><span><strong>Generating…</strong><small>Retrieving sources and composing a grounded answer.</small></span><button onClick={stopGeneration}>Stop</button></div>}
      {generationState === 'stopped' && <div className="generation-banner stopped"><span><strong>Generation stopped</strong><small>No answer was added.</small></span></div>}
      <div className="workspace-grid">
        <aside className="sources-panel"><div className="column-heading"><div><span className="eyebrow">SOURCES</span><h2>Knowledge base</h2></div><button className="panel-icon-action" title="Upload document"><Plus size={16} /><input type="file" accept=".pdf,.txt,.md" multiple onChange={uploadDocuments} /></button></div><label className="sources-search"><Search size={14} /><input value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} placeholder="Search sources" /></label><div className="source-filter-row"><span>All documents</span><span>{documents.length}</span></div><div className="source-list">{sourceDocuments.length ? sourceDocuments.map((document) => <button className="source-document" key={document.name} onClick={() => { setSelectedDocument(document.name); setActiveView('documents'); }}><FileText size={15} /><span>{document.name}</span><Check size={13} /></button>) : <div className="source-empty"><FolderOpen size={18} /><span>Upload a document to start</span></div>}</div><label className="source-upload-button"><Upload size={14} /> Upload document<input type="file" accept=".pdf,.txt,.md" multiple onChange={uploadDocuments} /></label></aside>
        <section className="answer-panel"><div className="answer-header"><div><span className="eyebrow">AI ANSWER</span><h1>Ask your documents</h1><p>Grounded responses with a visible source trail.</p></div><label className="persona-select compact"><span>CURRENT PERSONA</span><select value={persona.name} onChange={(event) => setPersona(personas.find((item) => item.name === event.target.value) || persona)}>{personas.map((item) => <option key={item.name} value={item.name}>{item.emoji} {item.name}</option>)}</select></label></div><div className="conversation-scroll">{messages.length ? <div className="workspace-messages">{messages.map((message, index) => <article className={`workspace-message ${message.role}`} key={`${message.role}-${index}`}><div className="workspace-message-label"><span className={message.role === 'user' ? 'mini-avatar user-avatar' : 'mini-avatar'}>{message.role === 'user' ? 'SS' : persona.emoji}</span><b>{message.role === 'user' ? 'You' : persona.name}</b><span>just now</span></div><div className="workspace-message-content">{message.content}</div>{message.role === 'assistant' && message.sources?.length > 0 && <div className="inline-citations">{message.sources.map((source, sourceIndex) => <button key={`${source.source}-${sourceIndex}`} onClick={() => focusSource(source, sourceIndex)}>[{sourceIndex + 1}] {source.source}</button>)}</div>}</article>)}</div> : <div className="workspace-empty"><div className="workspace-empty-icon"><Sparkles size={22} /></div><h2>Ask a question about your documents</h2><p>Persona will retrieve the relevant passages before answering.</p></div>}{isLoading && <div className="answer-loading"><span className="spinner" /> Retrieving evidence and composing an answer…</div>}</div>{currentAnswer && <div className="answer-actions"><button onClick={copyAnswer}><FileText size={14} /> Copy</button><button onClick={() => submitQuestion(currentQuestion?.content)} disabled={isLoading}><ArrowUp size={14} /> Regenerate</button><button onClick={() => submitQuestion('Summarize the previous answer using the same sources.')} disabled={isLoading}>Summarize</button><button onClick={() => submitQuestion('Explain the previous answer simply using the same sources.')} disabled={isLoading}>Explain simply</button></div>}<form className="workspace-composer" onSubmit={askQuestion}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); askQuestion(event); } }} placeholder="Ask anything about your knowledge base..." disabled={!documents.length || isLoading} rows="2" /><div className="workspace-composer-footer"><div><label title="Upload document"><Paperclip size={15} /><input type="file" accept=".pdf,.txt,.md" multiple onChange={uploadDocuments} /></label><button type="button" className={isListening ? 'listening' : ''} onClick={startVoiceInput} title="Voice input"><Mic size={15} /></button></div><button className="workspace-send" type="submit" disabled={!draft.trim() || !documents.length || isLoading}>{isLoading ? <span className="spinner" /> : <ArrowUp size={17} />}</button></div></form></section>
        <aside className="evidence-panel"><div className="column-heading"><div><span className="eyebrow">EVIDENCE</span><h2>Sources used</h2></div><span className="evidence-count">{currentSources.length || 0}</span></div>{currentSources.length ? <div className="evidence-list">{currentSources.map((source, index) => <button ref={(element) => { sourceRefs.current[index] = element; }} className={sourceToPreview === source ? 'evidence-card selected' : 'evidence-card'} key={`${source.source}-${index}`} onClick={() => focusSource(source, index)}><div className="evidence-card-top"><span className="evidence-number">[{index + 1}]</span><strong>{source.source}</strong></div><div className="evidence-meta">{source.page && source.page !== -1 ? `Page ${source.page}` : 'Page unavailable'}{source.similarity != null ? ` · ${Math.round(source.similarity * 100)}% relevant` : ''}</div><p>{source.text?.slice(0, 180)}{source.text?.length > 180 ? '…' : ''}</p></button>)}</div> : <div className="evidence-empty"><BookOpen size={19} /><span>Sources used will appear here</span></div>}<div className="preview-heading"><span className="eyebrow">DOCUMENT PREVIEW</span>{sourceToPreview?.page && sourceToPreview.page !== -1 && <small>Page {sourceToPreview.page}</small>}</div>{sourceToPreview ? <div className="document-preview"><div className="preview-title"><FileText size={15} /><strong>{sourceToPreview.source}</strong></div><p>{sourceToPreview.text}</p></div> : <div className="preview-empty">Select a citation to preview the retrieved passage.</div>}</aside>
      </div>
      <div className="workspace-scope-bar"><span className="eyebrow">ASK SCOPE</span><select value={collectionScope} onChange={(event) => setCollectionScope(event.target.value)}>{collectionOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><span>Frontend organization only; retrieval currently uses the backend's indexed corpus.</span></div>
      {previewLoading && <div className="preview-loading-toast"><span className="spinner" /> Loading preview…</div>}
      {error && <div className="error-banner workspace-error"><X size={17} /><span>{error}</span>{failedQuestion && <button onClick={() => { setError(''); submitQuestion(failedQuestion); }}>Retry answer</button>}<button onClick={() => setActiveView('documents')}>Go to Documents</button></div>}
    </section>;
  };

  const renderInsightsView = () => {
    const currentAnswer = [...messages].reverse().find((message) => message.role === 'assistant');
    const currentQuestion = [...messages].reverse().find((message) => message.role === 'user');
    const sources = currentAnswer?.sources || [];
    const inspectorSource = sources.includes(selectedSource) ? selectedSource : null;
    const pipeline = [
      { label: 'Query', value: currentQuestion?.content || 'No query submitted yet.' },
      { label: 'Retrieval', value: sources.length ? `${sources.length} source${sources.length === 1 ? '' : 's'} returned` : 'Waiting for a query' },
      { label: 'Reranking', value: sources.length ? 'Sorted by available similarity' : 'Waiting for retrieved sources' },
      { label: 'Selected context', value: inspectorSource ? '1 chunk selected' : sources.length ? 'Select a chunk below' : 'No context selected' },
      { label: 'LLM answer', value: currentAnswer ? 'Answer generated' : 'Waiting for answer' },
    ];

    return <section className="content insights-page">
      <div className="insights-header"><div><span className="eyebrow"><span className="eyebrow-line" /> RETRIEVAL OBSERVABILITY</span><h1>Retrieval Insights</h1><p>Trace the path from a question to the evidence behind an answer.</p></div><div className="insights-query"><span>QUERY</span><strong>{currentQuestion?.content || 'No query submitted yet'}</strong></div></div>
      <div className="retrieval-pipeline">{pipeline.map((step, index) => <React.Fragment key={step.label}><div className={step.label === 'LLM answer' ? 'pipeline-step final' : 'pipeline-step'}><span>{String(index + 1).padStart(2, '0')}</span><b>{step.label}</b><small>{step.value}</small></div>{index < pipeline.length - 1 && <div className="pipeline-arrow">↓</div>}</React.Fragment>)}</div>
      <div className="insights-grid"><section className="retrieved-panel"><div className="insights-section-heading"><div><span className="eyebrow">RETRIEVED SOURCES</span><h2>Evidence returned for this query</h2></div><span className="source-count">{sources.length} chunks</span></div>{sources.length ? <div className="retrieved-list">{sources.map((source, index) => <button ref={(element) => { sourceRefs.current[index] = element; }} className={inspectorSource === source ? 'retrieved-card selected' : 'retrieved-card'} key={`${source.source}-${index}`} onClick={() => focusSource(source, index)}><div className="retrieved-card-head"><span className="rank-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{source.source}</strong><span>{source.page && source.page !== -1 ? `Page ${source.page}` : 'Page unavailable'}</span></div><span className="retrieved-score">{source.similarity != null ? `${Math.round(source.similarity * 100)}%` : 'Score unavailable'}</span></div>{source.similarity != null && <div className="score-track"><span style={{ width: `${Math.max(0, Math.min(100, source.similarity * 100))}%` }} /></div>}<p>{source.text}</p></button>)}</div> : <div className="insights-empty"><BookOpen size={22} /><h3>No retrieved sources yet</h3><p>Ask a question in Ask Your Docs to inspect retrieval results.</p></div>}</section><aside className="inspector-panel"><div className="insights-section-heading"><div><span className="eyebrow">CHUNK INSPECTOR</span><h2>Selected context</h2></div><FileText size={16} /></div>{inspectorSource ? <div className="inspector-content"><div className="inspector-file"><FileText size={17} /><strong>{inspectorSource.source}</strong></div><div className="inspector-facts"><div><span>SOURCE</span><b>{inspectorSource.source}</b></div>{inspectorSource.page && inspectorSource.page !== -1 && <div><span>PAGE</span><b>{inspectorSource.page}</b></div>}{inspectorSource.similarity != null && <div><span>SIMILARITY</span><b>{Math.round(inspectorSource.similarity * 100)}%</b></div>}</div><div className="inspector-text"><span>FULL RETRIEVED TEXT</span><p>{inspectorSource.text}</p></div></div> : <div className="inspector-empty"><Search size={20} /><p>Select a retrieved chunk to inspect its full text and metadata.</p></div>}</aside></div>
      <div className="system-info"><div><span className="eyebrow">SYSTEM INFO</span><h2>Available retrieval signals</h2></div><div className="system-info-grid"><div><span>Retrieved chunks</span><b>{sources.length}</b></div>{currentAnswer?.usedContext != null && <div><span>Context used</span><b>{currentAnswer.usedContext ? 'Yes' : 'No'}</b></div>}{currentAnswer?.responseMs != null && <div><span>Request time</span><b>{currentAnswer.responseMs} ms</b></div>}</div></div>
    </section>;
  };

  const renderHistoryView = () => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const grouped = { Today: [], Yesterday: [], Earlier: [] };
    conversationHistory.forEach((conversation) => {
      const time = new Date(conversation.timestamp).getTime();
      grouped[time >= startOfToday ? 'Today' : time >= startOfYesterday ? 'Yesterday' : 'Earlier'].push(conversation);
    });
    return <section className="content history-page"><div className="history-header"><div><span className="eyebrow"><span className="eyebrow-line" /> CONVERSATION ARCHIVE</span><h1>Chat History</h1><p>Reopen conversations from this browser session.</p></div><button className="primary-upload" onClick={startNewConversation}><Plus size={16} /> New conversation</button></div>{conversationHistory.length ? Object.entries(grouped).map(([label, items]) => items.length > 0 && <section className="history-group" key={label}><div className="history-group-heading"><span>{label}</span><small>{items.length}</small></div>{items.map((conversation) => <button className={activeConversationId === conversation.id ? 'history-item active' : 'history-item'} key={conversation.id} onClick={() => openConversation(conversation)}><span className="history-icon"><MessageCircle size={15} /></span><span className="history-title">{conversation.title}</span><span className="history-date">{new Date(conversation.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></button>)}</section>) : <div className="history-empty"><MessageCircle size={23} /><h2>No saved conversations yet</h2><p>Start a conversation, then choose New conversation to save it here for this session.</p><button className="secondary-action" onClick={() => setActiveView('dashboard')}>Ask your docs</button></div>}<p className="session-note">History is kept in memory for this browser tab and is not persisted by the current backend.</p></section>;
  };

  const renderCompareView = () => (
    <section className="content compare-page">
      <div className="compare-header"><div><span className="eyebrow"><span className="eyebrow-line" /> DOCUMENT INTELLIGENCE</span><h1>Compare documents</h1><p>Ask one grounded question across a small set of source documents.</p></div><span className="compare-session-note">Uses the existing RAG retrieval path</span></div>
      <section className="compare-selector panel-card"><div className="panel-heading"><div><span className="eyebrow">1 / SELECT SOURCES</span><h3>Choose two or more documents</h3></div><span className="source-count">{compareSelection.length} selected</span></div>{documents.length ? <div className="compare-document-list">{documents.map((document) => <label className={compareSelection.includes(document.name) ? 'compare-document selected' : 'compare-document'} key={document.name}><input type="checkbox" checked={compareSelection.includes(document.name)} onChange={() => toggleCompareDocument(document.name)} /><span className="compare-check"><Check size={13} /></span><FileText size={17} /><span className="compare-document-name">{document.name}</span><small>{collectionMap[document.name] || 'Uncategorized'}</small></label>)}</div> : <div className="compare-empty"><FolderOpen size={20} /><span>Upload documents before comparing.</span><button className="secondary-action" onClick={() => setActiveView('documents')}>Open Documents</button></div>}<div className="compare-selected-row">{compareSelection.length ? <>{compareSelection.map((name) => <span className="selected-document-pill" key={name}>{name}<button type="button" onClick={() => toggleCompareDocument(name)} title={`Remove ${name}`}><X size={12} /></button></span>)}</> : <span>Select documents to see them here.</span>}<button className="clear-compare" type="button" onClick={() => setCompareSelection([])} disabled={!compareSelection.length}>Clear selection</button></div></section>
      <section className="compare-question panel-card"><div className="panel-heading"><div><span className="eyebrow">2 / ASK A QUESTION</span><h3>What should Persona compare?</h3></div><GitCompareArrows size={17} /></div><form onSubmit={generateComparison}><textarea value={compareQuestion} onChange={(event) => setCompareQuestion(event.target.value)} rows="2" placeholder="What are the key differences between these documents?" /><div className="compare-question-footer"><span>{compareSelection.length < 2 ? 'Select at least two documents to enable comparison.' : 'Citations will use the sources returned by the existing RAG endpoint.'}</span><button className="ask-button" type="submit" disabled={compareSelection.length < 2 || !compareQuestion.trim() || compareLoading}>{compareLoading ? <span className="spinner" /> : <>Compare now <ArrowUp size={15} /></>}</button></div></form></section>
      {compareAnswer ? <section className="comparison-result panel-card"><div className="comparison-result-header"><div><span className="eyebrow">3 / GROUNDED COMPARISON</span><h2>Comparison result</h2></div><button className="compare-copy" onClick={() => navigator.clipboard?.writeText(compareAnswer.answer)}><FileText size={14} /> Copy comparison</button></div><div className="comparison-answer">{compareAnswer.answer}</div>{compareAnswer.sources.length ? <div className="comparison-citations"><span className="eyebrow">CITATIONS RETURNED</span><div>{compareAnswer.sources.map((source, index) => <button key={`${source.source}-${index}`} onClick={() => focusSource(source, index)}>[{index + 1}] {source.source}{source.page && source.page !== -1 ? ` · p.${source.page}` : ''}</button>)}</div></div> : <div className="compare-warning">No source citations were returned for this comparison.</div>}<p className="compare-grounding-note">Selected documents guide the comparison prompt. The current backend does not expose document-scoped retrieval, so citations are shown exactly as returned by the existing RAG endpoint.</p></section> : <div className="comparison-placeholder"><GitCompareArrows size={24} /><h2>Your comparison will appear here</h2><p>Select documents and ask a question to generate a grounded result.</p></div>}
    </section>
  );

  if (!isAuthenticated) {
    return (
      <div className="login-page">
        <div className="login-panel">
          <div className="login-brand"><div className="brand-mark"><Sparkles size={17} /></div><strong>persona</strong></div>
          <div className="login-content">
            <div className="login-orb"><Sparkles size={26} /></div>
            <span className="login-kicker">YOUR PRIVATE KNOWLEDGE SPACE</span>
            <h1>Welcome<br /><em>back.</em></h1>
            <p className="login-lede">Step into a calmer way to work with the documents that matter.</p>
            <form className="login-form" onSubmit={handleLogin}>
              <label>Email or username<div className="login-input"><Mail size={15} /><input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="you@example.com" type="email" /></div></label>
              <label>Password<div className="login-input"><LockKeyhole size={15} /><input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Enter your password" type="password" /></div></label>
              <div className="login-options"><label className="remember"><input type="checkbox" /> Remember me</label><button type="button">Forgot password?</button></div>
              <a className="login-submit" href="?workspace=1">Enter workspace <ArrowRight size={16} /></a>
            </form>
            <p className="login-footnote">New to Persona? <button type="button" onClick={() => setLoginPassword('demo-access')}>Create an account</button></p>
          </div>
          <div className="login-footer"><span><span className="secure-dot" /> Your workspace is private by design</span><span>© 2026 Persona RAG</span></div>
        </div>
        <div className="login-visual">
          <div className="visual-noise" /><div className="visual-glow glow-one" /><div className="visual-glow glow-two" />
          <div className="floating-star star-one">✦</div><div className="floating-star star-two">✦</div><div className="floating-star star-three">·</div>
          <div className="book-scene"><div className="paper-sheet sheet-one">CITATIONS</div><div className="paper-sheet sheet-two">NOTES</div><div className="book book-back"><div className="book-cover" /><div className="book-pages" /></div><div className="book book-front"><div className="book-cover" /><div className="book-pages" /><span className="book-line" /><span className="book-line short" /></div><div className="book book-small"><div className="book-cover" /><div className="book-pages" /></div><div className="book-scene-ground" /><span className="knowledge-spark spark-a">✦</span><span className="knowledge-spark spark-b">+</span></div>
          <div className="visual-copy"><span className="login-kicker">A LITTLE MORE HUMAN</span><h2>Ask better questions.<br /><em>Find clearer answers.</em></h2><p>Your documents, organized around the way you think.</p></div>
          <div className="visual-credit">PERSONA / 01</div>
        </div>
      </div>
    );
  }

  return (
    <div className={darkMode ? 'app dark' : 'app'}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Sparkles size={17} /></div><div><strong>persona</strong><span>RAG workspace</span></div></div>
        <div className="workspace-switcher"><div className="workspace-icon"><BookOpen size={16} /></div><div><small>WORKSPACE</small><b>My knowledge base</b></div><ChevronDown size={15} /></div>
        <nav className="nav"><span className="nav-label">Workspace</span><button className={activeView === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('dashboard')}><MessageCircle size={17} /> Ask your docs <span className="nav-count">{messages.length}</span></button><button className={activeView === 'documents' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('documents')}><FolderOpen size={17} /> Documents <span className="nav-count">{documents.length}</span></button><button className={activeView === 'retrieval' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('retrieval')}><Gauge size={17} /> Retrieval insights</button><button className={activeView === 'history' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('history')}><MessageCircle size={17} /> History <span className="nav-count">{conversationHistory.length}</span></button><button className={activeView === 'compare' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('compare')}><GitCompareArrows size={17} /> Compare documents</button></nav>
        <div className="sidebar-docs"><div className="section-title"><span>Recent documents</span><label className="icon-button" title="Upload documents"><Plus size={16} /><input type="file" accept=".pdf,.txt,.md" multiple onChange={uploadDocuments} /></label></div>{documents.length ? documents.slice(0, 5).map((document) => <div className="doc-row" key={document.name}><FileText size={15} /><span>{document.name}</span><Check size={14} className="doc-check" /></div>) : <p className="muted-copy">Your library is waiting for its first document.</p>}</div>
        <div className="sidebar-bottom"><button className="nav-item" onClick={() => setShowSettings(!showSettings)}><Settings2 size={17} /> Workspace settings</button><div className="profile"><div className="avatar">SS</div><div><b>Shreya</b><span>Local workspace</span></div><button className="more-button">•••</button></div></div>
      </aside>
      <main className="main">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{activeView === 'documents' ? 'Documents' : activeView === 'retrieval' ? 'Retrieval insights' : activeView === 'history' ? 'Chat history' : activeView === 'compare' ? 'Compare documents' : 'Dashboard overview'}</strong></div><div className="top-actions"><span className="status-dot"><i /> API connected</span><button className="round-button" onClick={() => setDarkMode(!darkMode)} title="Toggle theme">{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button><button className="round-button" onClick={() => setShowSettings(!showSettings)} title="Open settings"><Settings2 size={17} /></button><button className="round-button" onClick={() => setIsAuthenticated(false)} title="Sign out"><LogOut size={16} /></button></div></header>
        {activeView === 'documents' ? renderDocumentsView() : activeView === 'retrieval' ? renderInsightsView() : activeView === 'history' ? renderHistoryView() : activeView === 'compare' ? renderCompareView() : <>{renderWorkspaceView()}<section className="content legacy-dashboard">
          <div className="intro"><div><div className="eyebrow"><span className="eyebrow-line" /> PRODUCT OVERVIEW</div><h1>Knowledge base<br /><em>at a glance.</em></h1><p>Everything your assistant knows, ready to explore through a voice you choose.</p></div><div className="intro-art"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><span>✦</span></div></div>
          <div className="overview-grid"><div className="metric-card"><span className="metric-label">Documents indexed</span><strong>{documents.length}</strong><small><span className="positive">+{documents.length}</span> this workspace</small><div className="metric-icon"><FolderOpen size={16} /></div></div><div className="metric-card"><span className="metric-label">Questions asked</span><strong>{Math.ceil(messages.length / 2)}</strong><small><span className="positive">Live</span> conversation activity</small><div className="metric-icon"><MessageCircle size={16} /></div></div><div className="metric-card"><span className="metric-label">Active persona</span><strong className="metric-persona">{persona.emoji} {persona.name}</strong><small>Voice for this session</small><div className="metric-icon"><Sparkles size={16} /></div></div><div className="summary-card"><div className="card-heading"><span>Workspace health</span><span className="health-pill"><i /> Ready</span></div><div className="health-row"><span>Retrieval engine</span><b>Connected</b></div><div className="health-row"><span>Source grounding</span><b>Strict</b></div><div className="health-row"><span>Last activity</span><b>{messages.length ? 'Just now' : 'Waiting'}</b></div></div></div>
          <section className="assistant-hero"><div className="assistant-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> YOUR ASSISTANT</span><h2>Ask your documents</h2><p>Get grounded answers from your knowledge base, with sources attached.</p></div><label className="persona-select"><span>ASSISTANT PERSONA</span><select value={persona.name} onChange={(event) => setPersona(personas.find((item) => item.name === event.target.value) || persona)}>{personas.map((item) => <option key={item.name} value={item.name}>{item.emoji} {item.name}</option>)}</select></label></div><form className="question-box" onSubmit={askQuestion}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); askQuestion(event); } }} placeholder="Ask anything about your knowledge base..." disabled={!documents.length || isLoading} rows="2" /><div className="question-actions"><div className="question-tools"><label className="tool-button" title="Upload documents"><Paperclip size={16} /><span>Attach</span><input type="file" accept=".pdf,.txt,.md" multiple onChange={uploadDocuments} /></label><button className={isListening ? 'tool-button listening' : 'tool-button'} type="button" onClick={startVoiceInput} title="Use voice input"><Mic size={16} /><span>{isListening ? 'Listening…' : 'Voice'}</span></button></div><button className="ask-button" type="submit" disabled={!draft.trim() || !documents.length || isLoading}>{isLoading ? <span className="spinner" /> : <>Ask now <ArrowUp size={16} /></>}</button></div></form>{!documents.length && <div className="upload-empty"><FolderOpen size={16} /><span>Upload a PDF, TXT, or Markdown file to unlock your assistant.</span><label className="upload-link">Add a document<input type="file" accept=".pdf,.txt,.md" multiple onChange={uploadDocuments} /></label></div>}</section>
          {messages.length > 0 && <div className="chat-heading"><div><span className="eyebrow">CONVERSATION</span><h2>Recent answers</h2></div><span className="chat-status"><i /> {persona.name} active</span></div>}
          {messages.length > 0 && <div className="chat-area"><div className="messages">{messages.map((message, index) => <div className={message.role === 'user' ? 'message user-message' : 'message assistant-message'} key={`${message.role}-${index}`}><div className="message-meta"><span className={message.role === 'user' ? 'mini-avatar user-avatar' : 'mini-avatar'}>{message.role === 'user' ? 'SS' : persona.emoji}</span><b>{message.role === 'user' ? 'You' : persona.name}</b><span className="message-time">just now</span>{message.role === 'assistant' && <button className="speak-button" onClick={() => speak(message.content)} title="Read answer aloud"><Volume2 size={15} /></button>}</div><div className="message-copy">{message.content}</div>{message.sources?.length > 0 && <div className="source-block"><div className="source-heading"><span><BookOpen size={14} /> {message.sources.length} sources consulted</span><span className="confidence">{message.usedContext ? 'High confidence' : 'Low confidence'}</span></div>{message.sources.slice(0, 3).map((source, sourceIndex) => <div className="source-item" key={`${source.source}-${sourceIndex}`}><span className="source-number">0{sourceIndex + 1}</span><div><b>{source.source}{source.page && source.page !== -1 ? ` · p.${source.page}` : ''}</b><p>{source.text.slice(0, 150)}{source.text.length > 150 ? '…' : ''}</p></div><span className="similarity">{Math.round(source.similarity * 100)}%</span></div>)}</div>}</div>)}</div></div>}
          <div className="dashboard-lower"><section className="panel-card"><div className="panel-heading"><div><span className="eyebrow">LIBRARY</span><h3>Recent documents</h3></div><label className="panel-action"><Plus size={14} /> Add<input type="file" accept=".pdf,.txt,.md" multiple onChange={uploadDocuments} /></label></div>{documents.length ? <div className="document-grid">{documents.slice(0, 6).map((document) => <div className="document-card" key={document.name}><div className="document-icon"><FileText size={17} /></div><div><strong>{document.name}</strong><span>Indexed and ready</span></div><Check size={14} /></div>)}</div> : <div className="panel-empty"><FolderOpen size={20} /><span>No documents indexed yet.</span><small>Your next answer starts with an upload.</small></div>}</section><section className="panel-card activity-panel"><div className="panel-heading"><div><span className="eyebrow">ACTIVITY</span><h3>Recent questions</h3></div><MessageCircle size={16} /></div>{messages.filter((message) => message.role === 'user').length ? <div className="activity-list">{messages.filter((message) => message.role === 'user').slice(-4).reverse().map((message, index) => <div className="activity-item" key={`${message.content}-${index}`}><span className="activity-dot" /><span>{message.content}</span><small>now</small></div>)}</div> : <div className="panel-empty compact"><MessageCircle size={20} /><span>No questions yet.</span><small>Ask your first question above.</small></div>}</section></div>
          {error && <div className="error-banner"><X size={17} /> {error}</div>}
          <div className="footer-note"><span><span className="secure-dot" /> Your documents stay in your local knowledge base.</span><span>{isUploading ? 'Indexing documents…' : `${documents.length} document${documents.length === 1 ? '' : 's'} indexed`}</span></div>
        </section></>}
      </main>
      {showSettings && <div className="settings-panel"><div className="settings-header"><div><span className="eyebrow">CONFIGURATION</span><h2>Workspace settings</h2></div><button className="round-button" onClick={() => setShowSettings(false)}><X size={17} /></button></div><label>Groq API key<input type="password" placeholder="gsk_…" value={apiKey} onChange={(event) => setApiKey(event.target.value)} /></label><p>Leave blank if `GROQ_API_KEY` is set on the backend.</p><button className="clear-button" onClick={() => { setMessages([]); setShowSettings(false); }}>Clear conversation</button><button className="clear-button danger" onClick={clearDocuments}><Trash2 size={15} /> Clear document index</button></div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
