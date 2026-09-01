# Final Demo / Presentation Guide

This outline matches the final-presentation expectations in the supplied project brief.

## 1. Problem statement — 30 seconds

"General LLMs may not know the contents of private/local course notes, manuals, and FAQs. This project builds an offline document Q&A assistant that retrieves evidence from local files before generating an answer, reducing hallucinations and keeping the data on-device."

## 2. Architecture — 45 seconds

Show or explain:

**Documents → parsing/chunking → Foundry Local embeddings → SQLite → query embedding → cosine/hybrid retrieval → selected context → Foundry Local LLM → grounded answer + Sources**

Mention that targeted Q&A uses RAG while whole-document summary actions use bounded ordered document context.

## 3. Key technologies — 30 seconds

- Microsoft Foundry Local
- RAG
- `qwen3-embedding-0.6b`
- cosine similarity / hybrid retrieval
- SQLite
- FastAPI + local HTML/JS interface
- prompt grounding / unsupported-answer fallback

## 4. Live demo — 2–3 minutes

Use the included demo corpus or a real course document.

### Demo A — answerable question
Upload/select `01_Solar_Microgrid_Technical_Guide.pdf` and ask:

`What does fault code F27 mean and what should the operator do?`

Expected idea: F27 = inverter overtemperature; reduce load, verify ventilation, allow cooling before restart. Expand Sources to show the supporting chunk.

### Demo B — missing information
Ask:

`What is the exact installation address of the microgrid?`

Expected: the assistant states that the information is not provided instead of inventing an address.

### Demo C — structured document
Select `03_Prototype_Design_Review_Rubric.docx` and ask:

`How should the team maximize its score?`

Expected: combine the three Excellent criteria without mixing lower bands.

### Optional Demo D — cross-language
Select `02_Engineering_Math_Assignment_Test.pdf` and ask:

`Soru 4 kaç puan?`

Expected: `10 puan.`

## 5. Testing — 30 seconds

Open the Tests page and explain that the project checks answerable, unanswerable, and edge-case behavior. Mention retrieval and generation timings are measured locally.

## 6. Lessons learned — 30 seconds

Suggested points:

- Chunk splitting strongly affects retrieval quality.
- Embedding similarity alone is not enough for tables/marks/forms, so hybrid structural retrieval improved accuracy.
- Grounding must reject unsupported facts, but overly strict verification can also create false negatives.
- Whole-document summarization and targeted RAG are different intents and should be routed differently.

## 7. Limitations — 15 seconds

- Image-only scanned PDFs require OCR.
- Highly visual or unusual mathematical layouts may not extract perfectly.
- Local model speed depends on hardware/model choice.

## Final 60-second smoke test before presenting

1. Start Foundry Local and `python app.py`.
2. Open `http://127.0.0.1:8501`.
3. Upload one demo PDF and confirm it indexes.
4. Ask one answerable question and expand Sources.
5. Ask one unavailable fact and confirm "not provided".
6. Open Tests and capture the observed timing/pass result.
