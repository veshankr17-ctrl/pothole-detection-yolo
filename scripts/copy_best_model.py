from __future__ import annotations

import shutil
from pathlib import Path


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    runs_root = project_root / "runs"
    backend_model_dir = project_root / "backend" / "models"
    backend_model_dir.mkdir(parents=True, exist_ok=True)

    candidates = sorted(runs_root.rglob("best.pt"), key=lambda p: p.stat().st_mtime)
    if not candidates:
        raise SystemExit("No best.pt found inside runs/. Train the model first.")

    latest_best = candidates[-1]
    target = backend_model_dir / "best.pt"
    shutil.copy2(latest_best, target)
    print(f"Copied model:\n  from: {latest_best}\n  to:   {target}")


if __name__ == "__main__":
    main()
