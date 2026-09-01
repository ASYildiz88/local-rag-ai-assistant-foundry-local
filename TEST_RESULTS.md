# Final Test Results

## Build/container validation — PASS

- `app.py`, `native_foundry.py`, `setup_models.py`, `verify_project.py`: Python syntax PASS.
- Static project validation: PASS.
- Final package contains no `__pycache__` / `.pyc`: PASS.
- UI build/model labels match code: PASS.
- External web-search implementation removed from final build: PASS.
- Core localhost Foundry Local integration remains present: PASS.

## Parser / architecture checks — PASS

- Ordered whole-document context is used for overview requests: PASS.
- Internal parser/index markers are sanitized from user-facing evidence: PASS.
- Conservative continuation stitching is present for split parser fragments: PASS.
- PDF/DOCX/TXT parsing paths remain available: PASS.
- SQLite RAG schema/retrieval code remains present: PASS.
- Automatic upload indexing remains present: PASS.
- Strict active-file scope remains present: PASS.

## Observed target-Windows regression results from the development run

The following behaviors were observed during interactive testing on the target Windows setup before final packaging:

- Solar microgrid PDF: direct facts, SOC range, condition/consequence, fault-code action, maintenance summary, logging interval/retention, and missing installation address: PASS.
- Engineering mathematics PDF: section topics, Question 4 marks, logarithmic-differentiation question, `tanh(x)=3/4`, component counts, six diameter values, missing submission deadline: PASS.
- Prototype rubric DOCX: criteria/marks, Excellent range, Excellent-vs-Good cell comparison, Needs Improvement, multi-row "maximize score" synthesis, missing deadline: PASS.
- Travel form DOCX: monthly expenses, sponsor, bank, travel/visa summary, preferred month, missing passport number: PASS.
- Network TXT: IP, telemetry/command ports, 30-second disconnect behavior, backup schedule, maintenance owner, missing Wi-Fi password: PASS.
- Turkish cross-language query `Soru 4 kaç puan?` → `10 puan`: PASS.
- Turkish cross-language query `Telemetri portu kaç?` → `5500`: PASS.
- Five network questions in one message, including one unavailable password: PASS.

## Final-package runtime limitation

The build container is Linux and does not provide the target Windows Microsoft Foundry Local runtime/GPU environment. Therefore the final cleaned package was not re-benchmarked with live Foundry inference inside this container. The final cleanup intentionally does not change the RAG/parser/generation logic; it removes unused features, aligns labels/docs, and prepares the submission package.

Before the live demo, run the short smoke test in `FINAL_DEMO_GUIDE.md` on the target Windows PC and record the in-app timing if required.

## Final packaging audit — PASS

Final submission audit after cleanup:

- Build/version label aligned between backend and UI: PASS.
- Standard/embedding model labels aligned with code: PASS.
- Advanced mode routing aligns with the documented optional `phi-4-mini` model: PASS.
- External search-provider implementation absent: PASS.
- App-level debug `print()` statements absent: PASS.
- Bytecode/cache artifacts absent: PASS.
- Five mixed-format demo documents included: PASS.
- README/architecture/test/demo/checklist documentation present: PASS.
- JavaScript syntax and shell-script syntax checks: PASS.

## Final synthesis regression fix

A final Windows smoke test found one failure for an optimization/advice question over a marking rubric: `How should the team maximize its score?` returned a single mark value instead of combining the supported Excellent criteria.

The final submission code now handles this reasoning shape generically: it still performs normal retrieval first, then expands evidence only within the active document for synthesis/advice intents such as maximize/improve/best-approach questions. Structured factual extraction is preserved for ordinary fact questions. No filename- or document-specific rule was added. Source cards for synthesis prefer evidence-rich structured records.

Static project validation after this change: **18/18 PASS**. Python syntax validation: **PASS**. The final Foundry Local generation/runtime smoke test must still be performed on the target Windows PC because this build environment cannot run the user's local Foundry service.

## Performance Evaluation — Windows / Foundry Local

A live performance check was run on the target Windows machine using Microsoft Foundry Local.

- **Answerable query**
  - Retrieval: **1.279 s**
  - Generation: **2.641 s**
  - Total: **3.920 s**
- **Unanswerable query**
  - Retrieval: **0.141 s**
  - Generation: **0.375 s**
  - Total: **0.516 s**
- **Average generated-query response time:** approximately **2.22 s**
- **Total evaluation runtime:** **4.44 s**
- **Empty-query guard:** **0.000 s** retrieval / **0.000 s** generation

Response time varies with query complexity, retrieved-context size, model warm-up state, and hardware. The built-in evaluation screen is used for retrieval/runtime checks; functional answer correctness was also verified separately with manual test cases.

