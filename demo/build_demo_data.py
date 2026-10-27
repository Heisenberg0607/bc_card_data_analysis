"""Compatibility entry point. Requires the final private 02_data directory."""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name("build_final_data.py")), run_name="__main__")
