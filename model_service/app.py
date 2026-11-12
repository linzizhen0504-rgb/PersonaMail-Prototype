"""FastAPI preference model service on port 3003. Start: uvicorn app:app --port 3003"""
from contextlib import asynccontextmanager
from typing import List, Optional

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import config
from change import analyze_change
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
    session_id: Optional[str] = None
    current_text: Optional[str] = None


class UpdateRequest(BaseModel):
    pid: str
    context: str
    intent_dimension: str
    event: str
    chosen_value: Optional[str] = None
    shown_values: List[str] = []
    session_id: Optional[str] = None
    current_text: Optional[str] = None
    shown_texts: Optional[List[str]] = None
    prompt: Optional[str] = None          # ai_edit: what the user asked the AI
    new_text: Optional[str] = None        # ai_edit: the text the user used (current_text is the text before)
    candidates: Optional[List[dict]] = None  # ai_edit: [{dimension, value}] the part can move to


class AnalyzeChangeRequest(BaseModel):
    before: Optional[str] = None
    after: Optional[str] = None


class ProfileRequest(BaseModel):
    pid: str
    session_id: str


class ResetSessionRequest(BaseModel):
    pid: str
    session_id: str


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
                          [c.model_dump() for c in req.candidates], req.k,
                          session_id=req.session_id, current_text=req.current_text)

    @app.post("/update")
    def update(req: UpdateRequest):
        return model.update(req.pid, req.context, req.intent_dimension,
                            req.event, req.chosen_value, req.shown_values,
                            session_id=req.session_id, current_text=req.current_text,
                            shown_texts=req.shown_texts, prompt=req.prompt, new_text=req.new_text,
                            candidates=req.candidates)

    @app.post("/analyze-change")
    def analyze_change_endpoint(req: AnalyzeChangeRequest):
        return analyze_change(model.embedder, req.before, req.after)

    @app.post("/profile")
    def profile(req: ProfileRequest):
        return model.profile_summary(req.pid, req.session_id)

    @app.post("/reset-session")
    def reset_session(req: ResetSessionRequest):
        model.reset_session(req.pid, req.session_id)
        return {"ok": True}

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
