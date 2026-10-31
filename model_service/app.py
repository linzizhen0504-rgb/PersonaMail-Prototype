"""FastAPI preference model service on port 3003. Start: uvicorn app:app --port 3003"""
from contextlib import asynccontextmanager
from typing import List, Optional

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import config
from embedding import Embedder
from model import PreferenceModel
from store import Store


class Candidate(BaseModel):
    value: str
    text: str


class RankRequest(BaseModel):
    pid: str
    context: str
    intent_dimension: str
    candidates: List[Candidate]
    k: Optional[int] = None


class UpdateRequest(BaseModel):
    pid: str
    context: str
    intent_dimension: str
    event: str
    chosen_value: Optional[str] = None
    shown_values: List[str] = []


class RejectCheckRequest(BaseModel):
    pid: str
    context: str
    intent_dimension: str


def create_app(model=None):
    owns_embedder = model is None
    if model is None:
        model = PreferenceModel(Store(config.DATA_DIR), Embedder())

    @asynccontextmanager
    async def lifespan(_app):
        if owns_embedder:
            model.embedder.load()  # load the embedding model once at startup
        yield

    app = FastAPI(title="PersonaMail preference model", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.ALLOWED_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.post("/rank")
    def rank(req: RankRequest):
        return model.rank(req.pid, req.context, req.intent_dimension,
                          [c.model_dump() for c in req.candidates], req.k)

    @app.post("/update")
    def update(req: UpdateRequest):
        return model.update(req.pid, req.context, req.intent_dimension,
                            req.event, req.chosen_value, req.shown_values)

    @app.post("/reject-check")
    def reject_check(req: RejectCheckRequest):
        return model.reject_check(req.pid, req.context, req.intent_dimension)

    @app.get("/stats")
    def stats(pid: str):
        return model.stats(pid)

    return app


app = create_app()

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=config.PORT)
