
from pathlib import Path
import io
import re


import requests
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pypdf import PdfReader


app = FastAPI(title="Company Knowledge Assistant API")

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "llama3.2:3b"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploaded document chunks are stored in memory.
# They are cleared when the backend restarts.
documents = {}


class QuestionRequest(BaseModel):
    question: str


@app.get("/")
def home():
    return {
        "message": "Company Knowledge Assistant API is running"
    }


@app.get("/health")
def health():
    try:
        response = requests.get(
            "http://localhost:11434/api/tags",
            timeout=5,
        )
        response.raise_for_status()

        models = response.json().get("models", [])
        available = any(
            model.get("name", "").split(":")[0]
            == MODEL_NAME.split(":")[0]
            and model.get("name", "") == MODEL_NAME
            for model in models
        )

        return {
            "api": "ok",
            "ollama": "connected",
            "model": MODEL_NAME,
            "model_available": available,
        }

    except requests.RequestException:
        return {
            "api": "ok",
            "ollama": "disconnected",
            "model": MODEL_NAME,
            "model_available": False,
        }


@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    filename = Path(file.filename or "").name

    if not filename.lower().endswith((".pdf", ".txt")):
        raise HTTPException(
            status_code=400,
            detail="Only PDF and TXT files are supported.",
        )

    if not filename:
        raise HTTPException(
            status_code=400,
            detail="Please select a file.",
        )

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty.",
        )

    if filename.lower().endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(content))
            text_content = "\n".join(
                page.extract_text() or ""
                for page in reader.pages
            )
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Could not read PDF: {exc}",
            ) from exc

    else:
        text_content = content.decode(
            "utf-8-sig",
            errors="replace",
        )

    if not text_content.strip():
        raise HTTPException(
            status_code=400,
            detail="No readable text was found in the document.",
        )

    # Save the original uploaded file.
    (UPLOAD_DIR / filename).write_bytes(content)

    # Split text into overlapping chunks.
    chunks = []
    chunk_size = 1000
    overlap = 150
    start = 0

    while start < len(text_content):
        chunk = text_content[start:start + chunk_size].strip()

        if chunk:
            chunks.append(chunk)

        if start + chunk_size >= len(text_content):
            break

        start += chunk_size - overlap

    documents[filename] = chunks

    return {
        "message": "Document uploaded successfully",
        "filename": filename,
        "chunks_created": len(chunks),
        "characters_extracted": len(text_content),
    }


@app.get("/documents")
def list_documents():
    return {
        "documents": [
            {
                "filename": filename,
                "chunks": len(chunks),
            }
            for filename, chunks in documents.items()
        ]
    }


def get_words(text):
    """Extract useful words for basic document matching."""
    stop_words = {
        "the", "is", "are", "was", "were", "what", "when",
        "where", "who", "why", "how", "can", "could", "would",
        "should", "does", "did", "and", "or", "for", "from",
        "with", "that", "this", "have", "has", "had", "you",
        "your", "please", "tell", "explain", "about", "into",
        "our", "their", "they", "them", "not", "any", "much",
        "many", "much", "get", "give", "want", "need",
    }

    return {
        word
        for word in re.findall(r"[a-zA-Z0-9+#.]+", text.lower())
        if len(word) > 2 and word not in stop_words
    }


def ask_ollama(prompt):
    """Send a prompt to the locally running Ollama model."""
    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL_NAME,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
                "stream": False,
            },
            timeout=180,
        )
        response.raise_for_status()

        data = response.json()
        answer = data.get("message", {}).get("content", "").strip()

        if not answer:
            raise HTTPException(
                status_code=502,
                detail="Ollama returned an empty answer.",
            )

        return answer

    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not contact Ollama. Make sure Ollama is running "
                f"and the {MODEL_NAME} model is installed. Details: {exc}"
            ),
        ) from exc

    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="Ollama returned an invalid response.",
        ) from exc


@app.post("/ask")
def ask_question(request: QuestionRequest):
    question = request.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Please enter a question.",
        )

    # Find document passages with overlapping keywords.
    question_words = get_words(question)
    scored = []

    for filename, chunks in documents.items():
        for chunk in chunks:
            chunk_words = get_words(chunk)
            score = len(question_words & chunk_words)

            if score > 0:
                scored.append((score, filename, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)

    # Require more than a single shared keyword when possible.
    # This helps avoid using an unrelated passage as evidence.
    selected = []

    if scored and question_words:
        best_score = scored[0][0]
        minimum_score = 2 if len(question_words) >= 2 else 1

        if best_score >= minimum_score:
            selected = [
                item for item in scored
                if item[0] >= minimum_score
            ][:4]

    # Only these terms suggest a company-specific question.
    company_terms = {
        "company", "employee", "employees", "policy", "policies",
        "internal", "leave", "attendance", "salary", "payroll",
        "benefits", "manager", "workplace", "organization",
        "organisation", "annual", "hr", "holiday", "holidays",
        "working", "office", "offices", "staff", "maternity",
        "paternity", "sick", "vacation",
    }

    is_company_question = bool(
        question_words & company_terms
    )

    sources = []

    if selected:
        # Company document question with matching evidence,
        # or a general question that happens to match a document.
        context = "\n\n".join(
            f"Source: {filename}\nPassage: {chunk}"
            for _, filename, chunk in selected
        )

        prompt = f"""
You are a helpful Company Knowledge Assistant.

Answer the user's question clearly and accurately.

Use the supplied passages as evidence for company-specific facts.
Do not invent company rules, benefits, or policies.

If the passages do not contain enough information to answer a
company-specific question, say that the information was not found
in the supplied documents.

For a general knowledge question, answer using your general
knowledge if the supplied passages are not relevant.

UPLOADED DOCUMENT PASSAGES:
{context}

USER QUESTION:
{question}

Provide a direct, easy-to-understand answer.
"""

        sources = [
            {
                "filename": filename,
                "passage": chunk,
            }
            for _, filename, chunk in selected
        ]

    elif is_company_question:
        # Never invent missing company-specific information.
        prompt = f"""
You are a Company Knowledge Assistant.

No relevant passages were found in the currently uploaded documents
for this company-specific question.

Do not guess or invent company policies or benefits.
Explain that the answer was not found in the uploaded documents.
Suggest contacting HR or the appropriate company team if needed.

USER QUESTION:
{question}
"""

    else:
        # General questions work even when no documents are uploaded.
        prompt = f"""
You are a helpful AI assistant with general knowledge.

Answer the user's question using your general knowledge.
Explain the answer clearly and simply.
Do not claim your answer came from company documents.
If you are unsure, state that clearly.

USER QUESTION:
{question}
"""

    answer = ask_ollama(prompt)

    return {
        "question": question,
        "answer": answer,
        "sources": sources,
    }
