# Submission Requirements Checklist

Mapped to the supplied 13-page project brief.

| Requirement from brief | Final project status |
|---|---|
| Local document Q&A assistant | ✅ Implemented |
| Microsoft Foundry Local for on-device inference | ✅ Implemented |
| Offline core / zero external search dependency | ✅ Final app ships no external search implementation; one-time setup may download models |
| RAG retrieve → augment → generate pattern | ✅ Implemented |
| Document chunking | ✅ Implemented |
| Embedding generation | ✅ `qwen3-embedding-0.6b` |
| SQLite storage of chunks + embeddings | ✅ Implemented |
| Query embedding using same embedding model | ✅ Implemented |
| Cosine similarity / top relevant chunks | ✅ Implemented, enhanced with lexical/structural scoring |
| Local LLM integration | ✅ `qwen2.5-1.5b`; optional `phi-4-mini` |
| Grounded system prompt / do not guess | ✅ Implemented |
| Source citations encouraged by brief | ✅ Source cards with file/page/chunk |
| Simple application UI | ✅ Local HTML/JS UI served by FastAPI |
| Small local document collection | ✅ Multi-file projects + five demo documents included |
| Answerable-query testing | ✅ Test plan + observed regressions + in-app Tests page |
| Unanswerable-query testing | ✅ Hallucination guard tests included |
| Empty/general edge cases | ✅ Empty-query guard and whole-document routing |
| Performance/debugging measurement | ✅ In-app retrieval/generation timing |
| README purpose / operation / setup | ✅ Expanded final README |
| Design decisions / limitations documented | ✅ README + ARCHITECTURE |
| Code cleanup/comments | ✅ Version labels aligned, dead web/voice paths removed, no `.pyc` artifacts |
| Final presentation preparation | ✅ `FINAL_DEMO_GUIDE.md` |
| Demo includes source or "I don't know" behavior | ✅ Demo script includes both |
| Lessons learned | ✅ Included in demo guide |
| Windows target runtime | ✅ Development/runtime tests performed on target Windows setup |
| macOS | ⚠️ Cross-platform instructions/dependencies included; final macOS runtime not independently executed in build container |
| Scanned/image-only PDFs | ⚠️ Explicit documented limitation; OCR not included |

## Submission recommendation

For the live hand-in/demo, submit the complete ZIP and use the included README, test evidence, demo corpus, and presentation guide. Immediately before presenting, perform the 60-second Windows smoke test and record the current performance result from the Tests page.
