from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Iterable, Optional


@dataclass(frozen=True)
class NativeStatus:
    ready: bool
    detail: str
    cached_models: tuple[str, ...] = ()


class FoundryNativeRuntime:
    """Thin, offline-first wrapper around the Microsoft Foundry Local Python SDK.

    Runtime inference uses cached models only. Model downloads are deliberately
    separated into setup_models.py so the normal application never needs the
    public internet after initial setup.
    """

    def __init__(
        self,
        app_name: str,
        standard_chat_alias: str,
        advanced_chat_alias: str,
        embedding_alias: str,
    ) -> None:
        self.app_name = app_name
        self.standard_chat_alias = standard_chat_alias
        self.advanced_chat_alias = advanced_chat_alias
        self.embedding_alias = embedding_alias
        self._manager = None
        self._models: dict[str, object] = {}
        self._chat_clients: dict[str, object] = {}
        self._embedding_clients: dict[str, object] = {}
        self._lock = threading.RLock()
        self._model_locks: dict[str, threading.RLock] = {}

    def _model_lock(self, alias: str) -> threading.RLock:
        with self._lock:
            return self._model_locks.setdefault(alias, threading.RLock())

    def _ensure_manager(self):
        with self._lock:
            if self._manager is not None:
                return self._manager

            try:
                from foundry_local_sdk import Configuration, FoundryLocalManager
            except Exception as exc:
                raise RuntimeError(
                    "Microsoft Foundry Local Python SDK is not installed. "
                    "Run install_and_setup.bat once while online."
                ) from exc

            try:
                FoundryLocalManager.initialize(
                    Configuration(app_name=self.app_name)
                )
            except Exception:
                # The SDK manager is a process singleton. If another part of the
                # process initialized it first, instance is still the right object.
                pass

            manager = FoundryLocalManager.instance
            if manager is None:
                raise RuntimeError("Foundry Local SDK could not initialize.")

            self._manager = manager
            return manager

    @staticmethod
    def _attr_text(model: object, name: str) -> str:
        value = getattr(model, name, "")
        try:
            if callable(value):
                value = value()
        except Exception:
            value = ""
        return str(value or "")

    @classmethod
    def _names(cls, model: object) -> tuple[str, ...]:
        values = []
        for name in ("alias", "id", "model_id", "name"):
            value = cls._attr_text(model, name).strip()
            if value:
                values.append(value)
        return tuple(dict.fromkeys(values))

    @classmethod
    def _matches(cls, model: object, alias: str) -> bool:
        wanted = alias.lower().strip()
        names = [value.lower() for value in cls._names(model)]

        # Exact model IDs such as qwen3-embedding-0.6b-generic-cpu:1 must
        # never accidentally match a CUDA sibling from the same family.
        if ":" in wanted or "-generic-cpu" in wanted or "-cuda-gpu" in wanted:
            return wanted in names

        for low in names:
            if low == wanted or low.startswith(wanted + "-") or wanted in low:
                return True
        return False

    def cached_models(self) -> list[object]:
        manager = self._ensure_manager()
        try:
            return list(manager.catalog.get_cached_models())
        except Exception as exc:
            raise RuntimeError(
                "Could not read the local Foundry model cache. "
                "Run setup_models.py once while online if this is a first-time setup."
            ) from exc

    def cached_model_names(self) -> tuple[str, ...]:
        names: list[str] = []
        for model in self.cached_models():
            model_names = self._names(model)
            names.append(model_names[0] if model_names else "cached-model")
        return tuple(names)

    def _cached_model(self, alias: str):
        cached = self.cached_models()
        for model in cached:
            if self._matches(model, alias):
                return model
        raise RuntimeError(
            f"Model '{alias}' is not cached locally. "
            "Connect to the internet once and run setup_models.py."
        )

    @staticmethod
    def _is_loaded(model: object) -> bool:
        value = getattr(model, "is_loaded", False)
        try:
            return bool(value() if callable(value) else value)
        except Exception:
            return False

    def model(self, alias: str):
        with self._model_lock(alias):
            cached = self._models.get(alias)
            if cached is not None:
                return cached

            model = self._cached_model(alias)
            if not self._is_loaded(model):
                try:
                    model.load()
                except Exception as exc:
                    text = str(exc)
                    if (
                        "CUDAExecutionProvider" in text
                        and "Available EPs: [CPUExecutionProvider]" in text
                    ):
                        raise RuntimeError(
                            f"Model '{alias}' requires CUDA, but this Foundry Local SDK "
                            "session currently has only CPUExecutionProvider. "
                            "Use the CPU model variant and rerun setup_models.py."
                        ) from exc
                    raise
            self._models[alias] = model
            return model

    def _chat_aliases(self, level: str) -> list[str]:
        if str(level).lower() == "advanced":
            return [self.advanced_chat_alias, self.standard_chat_alias]
        return [self.standard_chat_alias, self.advanced_chat_alias]

    def chat_model(self, level: str):
        last_error: Optional[Exception] = None
        for alias in self._chat_aliases(level):
            try:
                return alias, self.model(alias)
            except Exception as exc:
                last_error = exc
        raise RuntimeError(
            "No cached Foundry chat model is available. "
            "Run setup_models.py once while online."
            + (f" ({last_error})" if last_error else "")
        )

    def chat_client(self, level: str):
        alias, model = self.chat_model(level)
        with self._model_lock(alias):
            client = self._chat_clients.get(alias)
            if client is None:
                client = model.get_chat_client()
                self._chat_clients[alias] = client
        return alias, client

    def embedding_client(self):
        alias = self.embedding_alias
        with self._model_lock(alias):
            client = self._embedding_clients.get(alias)
            if client is None:
                model = self.model(alias)
                client = model.get_embedding_client()
                self._embedding_clients[alias] = client
        return client

    @staticmethod
    def _stream_content(chunk: object) -> str:
        try:
            choices = getattr(chunk, "choices", None) or []
            if not choices:
                return ""
            delta = getattr(choices[0], "delta", None)
            return str(getattr(delta, "content", "") or "")
        except Exception:
            return ""

    @staticmethod
    def _complete_content(response: object) -> str:
        try:
            choices = getattr(response, "choices", None) or []
            if not choices:
                return ""
            message = getattr(choices[0], "message", None)
            return str(getattr(message, "content", "") or "")
        except Exception:
            return ""

    def stream_chat(self, messages: list[dict], level: str):
        alias, client = self.chat_client(level)
        try:
            iterator = client.complete_streaming_chat(messages)
            for chunk in iterator:
                content = self._stream_content(chunk)
                if content:
                    yield alias, content
            return
        except Exception:
            # Native non-streaming fallback avoids losing a full answer if a
            # streaming iterator fails on a specific model/provider.
            response = client.complete_chat(messages)
            content = self._complete_content(response)
            if not content.strip():
                raise RuntimeError("The local Foundry model returned no text.")
            yield alias, content

    def complete_chat(self, messages: list[dict], level: str = "Standard") -> tuple[str, str]:
        alias, client = self.chat_client(level)
        response = client.complete_chat(messages)
        content = self._complete_content(response).strip()
        if not content:
            raise RuntimeError("The local Foundry model returned no text.")
        return alias, content

    def embed_many(self, texts: Iterable[str]) -> list[list[float]]:
        values = [str(text) for text in texts]
        if not values:
            return []
        client = self.embedding_client()
        if len(values) == 1:
            response = client.generate_embedding(values[0])
        else:
            response = client.generate_embeddings(values)
        data = getattr(response, "data", None) or []
        vectors = [list(getattr(item, "embedding", []) or []) for item in data]
        if len(vectors) != len(values) or any(not vector for vector in vectors):
            raise RuntimeError("Foundry Local returned an invalid embedding response.")
        return vectors

    def status(self) -> NativeStatus:
        """
        Informational status only. The local Foundry server is the source of
        truth for model availability in the final app.
        """
        try:
            cached = self.cached_model_names()
            return NativeStatus(
                True,
                "Direct SDK available; server runtime controls model availability",
                cached,
            )
        except Exception as exc:
            return NativeStatus(False, str(exc), ())


    def warmup(self) -> NativeStatus:
        try:
            # Chat remains on the direct SDK. Embeddings run through the local
            # Foundry server so its registered CUDAExecutionProvider is used.
            self.chat_client("Standard")
            return self.status()
        except Exception as exc:
            return NativeStatus(False, str(exc), ())

    def reset(self) -> None:
        with self._lock:
            self._models.clear()
            self._chat_clients.clear()
            self._embedding_clients.clear()
