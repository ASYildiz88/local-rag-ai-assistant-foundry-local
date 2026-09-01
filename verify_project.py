from pathlib import Path
import ast
import re
import zipfile

ROOT = Path(__file__).resolve().parent
required = [
    ROOT / "app.py",
    ROOT / "native_foundry.py",
    ROOT / "setup_models.py",
    ROOT / "requirements.txt",
    ROOT / "static" / "index.html",
    ROOT / "static" / "app.css",
    ROOT / "static" / "app.js",
    ROOT / "README.md",
    ROOT / "ARCHITECTURE.md",
    ROOT / "TEST_PLAN.md",
    ROOT / "TEST_RESULTS.md",
    ROOT / "FINAL_DEMO_GUIDE.md",
    ROOT / "SUBMISSION_CHECKLIST.md",
]
missing = [str(p.relative_to(ROOT)) for p in required if not p.exists()]
if missing:
    print("Missing files:", *missing, sep="\n- ")
    raise SystemExit(1)

for name in ("app.py", "native_foundry.py", "setup_models.py", "verify_project.py"):
    if name == "verify_project.py":
        continue
    ast.parse((ROOT / name).read_text(encoding="utf-8"))

app = (ROOT / "app.py").read_text(encoding="utf-8")
html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
js = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
readme = (ROOT / "README.md").read_text(encoding="utf-8")

checks = {
    "Final build id": 'BUILD_ID = "FINAL SUBMISSION 1.0"' in app,
    "Foundry Local runtime integration": "FoundryNativeRuntime" in app,
    "Standard chat model": 'CHAT_ALIAS = "qwen2.5-1.5b"' in app,
    "Advanced chat model": 'ADVANCED_CHAT_ALIAS = "phi-4-mini"' in app,
    "Advanced model routing": 'return [ADVANCED_CHAT_ALIAS, CHAT_ALIAS]' in app,
    "Embedding model": "qwen3-embedding-0.6b" in app,
    "SQLite RAG": "retrieve_scoped" in app and "cosine(query_vector" in app,
    "Immediate upload indexing": "_index_uploaded_documents_with_retry" in app and 'mode": "rag-indexed"' in app,
    "Strict active-file scope": "STRICT SCOPE" in app and "activeFile" in js,
    "Whole-document context route": "whole_document_context" in app and "document_overview_intent" in app,
    "Schema-agnostic logical records": "_docx_table_records" in app and "_metadata_structural_score" in app and "search_text" in app,
    "Four file actions": all(label in html for label in ("Summarize", "Key facts", "Explain", "Ask file")),
    "UI chat model matches code": "Standard chat: qwen2.5-1.5b" in html,
    "Final UI label": "Final Submission 1.0" in html,
    "No external search implementation": not any(term in app for term in ("google_search(", "duckduckgo_search(", "bing_search(", "wikipedia_search(", "Searching web", "WEB EVIDENCE")),
    "No web UI control": "webBtn" not in html and "webEnabled" not in js,
    "No disabled voice UI": "micBtn" not in html and "/api/transcribe" not in app,
    "README documents offline boundary": "no external web-search implementation is shipped" in readme,
    "Demo corpus has at least five documents": len([p for p in (ROOT / "demo_documents").iterdir() if p.suffix.lower() in {".pdf", ".docx", ".txt"} and not p.name.startswith("TEST_")]) >= 5,
    "No bytecode artifacts": not any(ROOT.rglob("*.pyc")) and not any(p.name == "__pycache__" for p in ROOT.rglob("*")),
}

failed = [name for name, ok in checks.items() if not ok]
if failed:
    print("Validation failed:", *failed, sep="\n- ")
    raise SystemExit(1)

print(f"Local AI Final Submission static validation: OK ({len(checks)}/{len(checks)} checks)")
