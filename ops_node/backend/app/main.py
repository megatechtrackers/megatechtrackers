"""
Operations Service - FastAPI Backend
Simplified GPS Tracker Configuration System
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from contextlib import asynccontextmanager
import traceback
import asyncio
from datetime import datetime, timedelta

from app.config import get_settings
from app.database import init_db, async_session
from app.routers import devices, units, commands, io_mappings, location_references
from app.utils.metrics import (
    get_metrics, get_content_type, 
    record_cleanup_expired, record_cleanup_history_deleted,
    http_requests_total
)

settings = get_settings()

# Cleanup configuration
# NOTE: Modem service also runs cleanup. Backend cleanup is a FALLBACK for when modem is offline.
# We use longer intervals here to reduce duplicate work.
OUTBOX_TIMEOUT_MINUTES = 1    # Max time for command to stay in outbox
REPLY_TIMEOUT_MINUTES = 2     # Max time to wait for device reply
CLEANUP_INTERVAL_SECONDS = 60  # Backend cleanup interval (longer than modem's 30s - acts as fallback)
HISTORY_RETENTION_DAYS = 90   # Days to keep command history
HISTORY_CLEANUP_INTERVAL = 3600  # Run history cleanup every hour


async def cleanup_old_commands():
    """Background task to clean up stuck commands"""
    from sqlalchemy import select, delete
    from app.models import CommandOutbox, CommandSent, CommandHistory
    
    while True:
        try:
            async with async_session() as db:
                now = datetime.now()
                cleaned = 0
                
                # 1. Timeout old OUTBOX commands (modem unavailable)
                outbox_cutoff = now - timedelta(minutes=OUTBOX_TIMEOUT_MINUTES)
                result = await db.execute(
                    select(CommandOutbox).where(CommandOutbox.created_at < outbox_cutoff)
                )
                old_outbox = result.scalars().all()
                
                for cmd in old_outbox:
                    # Add to history as failed
                    history = CommandHistory(
                        imei=cmd.imei,
                        sim_no=cmd.sim_no,
                        direction="outgoing",
                        command_text=cmd.command_text,
                        config_id=cmd.config_id,
                        status="failed",
                        send_method=cmd.send_method,
                        user_id=cmd.user_id,
                        created_at=cmd.created_at,
                        sent_at=now
                    )
                    db.add(history)
                    await db.delete(cmd)
                    cleaned += 1
                    record_cleanup_expired('outbox_timeout')
                    print(f"[Cleanup] Outbox timeout ({cmd.send_method}): {cmd.imei} -> {cmd.sim_no} marked as 'failed'")
                
                # 2. Timeout old SENT commands (no reply)
                sent_cutoff = now - timedelta(minutes=REPLY_TIMEOUT_MINUTES)
                result = await db.execute(
                    select(CommandSent).where(
                        CommandSent.status == "sent",
                        CommandSent.sent_at < sent_cutoff
                    )
                )
                old_sent = result.scalars().all()
                
                for cmd in old_sent:
                    # Update history to 'no_reply' - match by imei, command_text, and created_at
                    result = await db.execute(
                        select(CommandHistory).where(
                            CommandHistory.imei == cmd.imei,
                            CommandHistory.command_text == cmd.command_text,
                            CommandHistory.direction == "outgoing",
                            CommandHistory.status == "sent",
                            CommandHistory.created_at == cmd.created_at
                        )
                    )
                    history_cmd = result.scalar_one_or_none()
                    if history_cmd:
                        history_cmd.status = "no_reply"
                    else:
                        # Fallback: try to find any matching sent command for this imei
                        result = await db.execute(
                            select(CommandHistory).where(
                                CommandHistory.imei == cmd.imei,
                                CommandHistory.command_text == cmd.command_text,
                                CommandHistory.direction == "outgoing",
                                CommandHistory.status == "sent"
                            ).order_by(CommandHistory.created_at.desc()).limit(1)
                        )
                        history_cmd = result.scalar_one_or_none()
                        if history_cmd:
                            history_cmd.status = "no_reply"
                    
                    await db.delete(cmd)
                    cleaned += 1
                    record_cleanup_expired('no_reply')
                    print(f"[Cleanup] Sent timeout ({cmd.send_method}): {cmd.imei} -> {cmd.sim_no} marked as 'no_reply'")
                
                if cleaned > 0:
                    await db.commit()
                    print(f"[Cleanup] Cleaned up {cleaned} timed-out commands")
                    
        except Exception as e:
            print(f"[Cleanup] Error: {e}")
        
        # Wait before next cleanup
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)


async def cleanup_old_history():
    """Background task to clean old history records (runs every hour)"""
    from sqlalchemy import text
    
    while True:
        try:
            async with async_session() as db:
                # Use the PostgreSQL function to clean old history
                result = await db.execute(
                    text(f"SELECT cleanup_old_history({HISTORY_RETENTION_DAYS})")
                )
                deleted_count = result.scalar()
                await db.commit()
                
                if deleted_count and deleted_count > 0:
                    record_cleanup_history_deleted(deleted_count)
                    print(f"[History Cleanup] Deleted {deleted_count} records older than {HISTORY_RETENTION_DAYS} days")
                    
        except Exception as e:
            print(f"[History Cleanup] Error: {e}")
        
        # Wait before next cleanup (hourly)
        await asyncio.sleep(HISTORY_CLEANUP_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown"""
    # Startup
    print(f"Starting {settings.app_name} v{settings.app_version}")
    print(f"CORS Origins: {settings.cors_origins_list}")
    print(f"Cleanup config: OUTBOX_TIMEOUT={OUTBOX_TIMEOUT_MINUTES}min, REPLY_TIMEOUT={REPLY_TIMEOUT_MINUTES}min")
    
    # Start background cleanup tasks
    cleanup_task = asyncio.create_task(cleanup_old_commands())
    history_cleanup_task = asyncio.create_task(cleanup_old_history())
    print("Background cleanup tasks started (command timeout: 60s, history retention: hourly)")
    
    yield
    
    # Shutdown
    cleanup_task.cancel()
    history_cleanup_task.cancel()
    try:
        await cleanup_task
        await history_cleanup_task
    except asyncio.CancelledError:
        pass
    print("Shutting down...")


app = FastAPI(
    title=settings.app_name,
    description="Simplified GPS Tracker Configuration System with IMEI as primary key",
    version=settings.app_version,
    lifespan=lifespan
)

# CORS middleware - MUST be added before exception handlers
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler to ensure proper error responses
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions and return proper JSON response"""
    print(f"Unhandled exception: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"}
    )

# Include routers
app.include_router(devices.router, prefix="/api/devices", tags=["Devices"])
app.include_router(units.router, prefix="/api/units", tags=["Units"])
app.include_router(commands.router, prefix="/api/commands", tags=["Commands"])
app.include_router(io_mappings.router, prefix="/api/io-mappings", tags=["IO Mappings"])
app.include_router(location_references.router, prefix="/api/location-references", tags=["Location Reference Points"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "version": settings.app_version}


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return Response(
        content=get_metrics(),
        media_type=get_content_type()
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )
