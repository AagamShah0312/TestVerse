"""Backward-compatible production settings entry point.

Use ``exam_system.settings`` for all environments.  It derives production
behaviour from environment variables and avoids maintaining two diverging
settings modules.
"""
from .settings import *  # noqa: F401,F403
