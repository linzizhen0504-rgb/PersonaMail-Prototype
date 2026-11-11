"""Where the end-to-end scripts find the app. Override with the environment variables BASE_URL and PROJECT_ROOT."""
import os
from pathlib import Path

BASE_URL = os.environ.get('BASE_URL', 'http://localhost:3000').rstrip('/')
PROJECT_ROOT = Path(os.environ.get('PROJECT_ROOT', Path(__file__).resolve().parents[2]))
