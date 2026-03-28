"""
API routes module
"""

from flask import Blueprint

graph_bp = Blueprint('graph', __name__)
simulation_bp = Blueprint('simulation', __name__)

from . import graph  # noqa: E402, F401
from . import simulation  # noqa: E402, F401

# Import forum blueprint (defined in forum.py with its own Blueprint)
from .forum import forum_bp  # noqa: E402, F401

