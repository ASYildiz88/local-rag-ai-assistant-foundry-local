# Final Test Plan

This plan follows the testing/evaluation expectations in the supplied project brief.

## 1. Setup and static validation

- Python syntax check for `app.py`, `native_foundry.py`, `setup_models.py`, and `verify_project.py`.
- Run `python verify_project.py`.
- Confirm the final ZIP contains no `__pycache__` or `.pyc` files.
- Confirm UI/build/model labels match the code.
- Confirm no external web-search implementation is present.

## 2. Ingestion tests

Use the five files in `demo_documents/`.

Verify for each file:
- upload succeeds,
- indexing happens automatically,
- chunk/source count is non-zero,
- the file appears in the project library,
- the most recently selected/uploaded file becomes active.

## 3. Answerable Q&A

Use questions in `demo_documents/TEST_QUESTIONS_AND_EXPECTED.txt` covering:
- direct numeric facts,
- ranges,
- conditional consequences,
- fault code + action,
- marks / numbered questions,
- formulas/fractions,
- table/rubric cells,
- form label-value fields,
- TXT network values,
- multi-evidence synthesis.

Expected result: concise answer supported by the active document and relevant Sources.

## 4. Unanswerable / hallucination guard

Ask facts deliberately absent from each document, for example a nonexistent deadline, password, passport number, or installation address.

Expected result: a localized "not provided" / insufficient-information response with no invented values.

## 5. Active-file isolation

Load multiple files into one project and ask a fact that exists only in another non-active file.

Expected result: the assistant must not silently use that other file unless the user explicitly asks for multiple/all files.

## 6. Whole-document intents

For a previously unseen normal text-based document, test:
- Summarize,
- Key Facts,
- Explain,
- "What is this document about?",
- Turkish "ne anlatıyor?".

Expected result: a natural synthesis from the active document, no internal parser metadata, no broken chunk fragments.

## 7. Cross-language retrieval

Examples:
- Turkish question against English assignment text: `Soru 4 kaç puan?`
- Turkish question against English network notes: `Telemetri portu kaç?`

Expected result: correct answer in Turkish.

## 8. Multi-question input

Send several related questions in one message.

Expected result: each sub-question is answered separately and missing information remains explicitly unsupported.

## 9. Edge cases

- Empty query: rejected by the API/UI.
- Unsupported file type: rejected with supported-types message.
- Scanned/image-only PDF with no selectable text: clear OCR limitation message.
- Local model runtime unavailable: clear setup/recovery error rather than fabricated content.

## 10. Performance

Use the in-app Tests page and record:
- retrieval time,
- generation time,
- total response time,
- answerable/unanswerable pass status.

The brief suggests small local models may target roughly 1–3 seconds on a typical laptop, but actual time depends on hardware/model/runtime. Record observed target-PC results rather than claiming an unmeasured number.

### Synthesis / optimization regression
- Upload a structured rubric or criteria document.
- Ask a question that requires combining several supported rows (for example, how to maximize a score).
- Expected: combine all relevant supported criteria; do not collapse the answer to one numeric field; do not introduce outside advice.
