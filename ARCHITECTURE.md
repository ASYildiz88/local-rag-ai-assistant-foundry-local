# Local AI — Final Submission Architecture

## Goal

Build an offline local document Q&A assistant using Microsoft Foundry Local and RAG. The system retrieves supporting content from local documents before asking a local LLM to generate an answer.

## Components

### Client interface
A local HTML/CSS/JavaScript interface served by FastAPI. It supports project creation, file upload, chat, document actions, source inspection, settings, and evaluation tests.

### Ingestion layer
Supported input formats are PDF, DOCX, and TXT. The parser extracts clean document text plus reusable structural information such as headings, sections, table rows/cells, label-value pairs, numbered questions, and marks. No rule depends on a filename, course code, company, or known test document.

### Chunking
Normal prose is grouped into bounded chunks of roughly one to three paragraphs with overlap. Atomic structured records such as table fields and question records remain intact where possible.

### Embeddings and local storage
Each chunk is embedded with `qwen3-embedding-0.6b` through Microsoft Foundry Local. Text, embedding vectors, source information, page/chunk identifiers, and structural metadata are stored in SQLite inside the local project workspace.

### Retrieval
Targeted Q&A uses hybrid evidence selection:

- embedding cosine similarity,
- lexical/exact matching,
- structural metadata matching,
- direct-field/question/marks extraction when appropriate.

The active file is strictly scoped unless the user explicitly requests multiple/all files.

### Generation
The Standard local chat model is `qwen2.5-1.5b`; `phi-4-mini` is an optional Advanced model. The selected evidence is passed to the local Foundry Local model with a grounding instruction. The model is not asked to search the Internet.

### Responsible output
If retrieved evidence does not support an answer, the assistant returns a clear localized fallback. Source cards expose the evidence used for grounded answers. Internal parser metadata is stripped before user-facing output.

### Whole-document actions
Summarize, Key Facts, Explain, and document-overview questions use a bounded ordered representation of the active document rather than top-k semantic retrieval. This preserves document coverage and prevents raw chunk lists from being presented as summaries.

## Offline boundary

The final application ships no external web-search implementation. Runtime network traffic is limited to localhost communication with the Foundry Local service. One-time dependency/model installation may require Internet access before offline use.

## SQLite rationale

SQLite matches the supplied brief: it is serverless, self-contained, cross-platform, simple to integrate, and suitable for the small local document collections used by this project.

## Limitations

Image-only scans require OCR outside this build. Highly visual layouts, handwriting, or unusual mathematical formatting may lose information during text extraction. The system therefore favors unsupported-answer rejection over fabrication.
