from fastapi import APIRouter, Depends

from app.api.auth import verify_token
from app.api.routes.presets import router as presets_router
from app.api.routes.sender import router as sender_router
from app.api.routes.ai import router as ai_router
from app.api.routes.relay import router as relay_router
from app.api.routes.settings import router as settings_router

api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(verify_token)])

api_router.include_router(presets_router, prefix="/presets", tags=["presets"])
api_router.include_router(sender_router, prefix="/send", tags=["sender"])
api_router.include_router(ai_router, prefix="/ai", tags=["ai"])
api_router.include_router(settings_router, prefix="/settings", tags=["settings"])
api_router.include_router(relay_router, prefix="/relay", tags=["relay"])
