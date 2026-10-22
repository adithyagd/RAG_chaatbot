# Company Knowledge Assistant (RAG)

An intelligent Company Knowledge Management System powered by **Retrieval-Augmented Generation (RAG)**. The application allows employees to upload company policies and documents (PDF, TXT), extracts text into contextual chunks, and answers user queries using a local LLM (**Llama 3.2 via Ollama**) with direct source citations.

---

## 🌟 Key Features

- **Document Ingestion & Chunking**: Upload company documents in PDF or TXT format with automatic overlapping chunking.
- **Contextual Retrieval**: Matches user questions against relevant document chunks to provide context-grounded responses.
- **Local LLM Privacy**: Powered by Ollama (`llama3.2:3b`), ensuring all sensitive company data remains strictly on-premise/local.
- **Source Verification & Citations**: Responses include exact document references and passages used to answer questions.
- **Modern Responsive UI**: Built with React, TypeScript, and Vite featuring live health monitoring and document management tabs.

---

## 🛠️ Tech Stack

- **Backend**: Python 3.12, FastAPI, Uvicorn, PyPDF, Requests
- **LLM Engine**: Ollama running `llama3.2:3b`
- **Frontend**: React 19, TypeScript, Vite, CSS3
- **Document Store**: In-memory vector/keyword retrieval engine

---

## 🚀 Quick Start Guide

### 1. Prerequisites

- **Python 3.10+**
- **Node.js 18+** & **npm**
- **Ollama** installed and running

Ensure the Llama model is pulled in Ollama:
```bash
ollama run llama3.2:3b
```

---

### 2. Backend Setup

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Create and activate a virtual environment:
   ```bash
   # Windows (PowerShell)
   python -m venv .venv
   .venv\Scripts\Activate.ps1

   # Linux / macOS
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the FastAPI backend server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   The backend will run at `http://127.0.0.1:8000`. API documentation is available at `http://127.0.0.1:8000/docs`.

---

### 3. Frontend Setup

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   The frontend will run at `http://localhost:5173`.

---

## 📖 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | API status message |
| `GET` | `/health` | Health check for FastAPI and Ollama connection |
| `POST` | `/upload` | Upload PDF or TXT documents for chunking and indexing |
| `GET` | `/documents` | List uploaded documents and chunk counts |
| `POST` | `/ask` | Submit questions and receive answers with source passages |

---

## 📄 License

This project is licensed under the MIT License.
