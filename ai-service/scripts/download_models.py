import shutil
from pathlib import Path

from huggingface_hub import hf_hub_download, list_repo_files

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
PINS = [
    ("deepghs/manga109_yolo", "v2023.12.07_n/model.pt", "manga109_yolo.pt"),
    ("kitsumed/yolov8m_seg-speech-bubble", None, "bubble_seg.pt"),
]


def pick_file(repo_id: str, preferred: str | None) -> str:
    files = list_repo_files(repo_id)
    if preferred and preferred in files:
        return preferred
    pt_files = [f for f in files if f.endswith(".pt")]
    if not pt_files:
        raise SystemExit(f"No .pt file found in {repo_id}")
    print(f"[warn] preferred file not found in {repo_id}, using {pt_files[0]}")
    return pt_files[0]


def main():
    MODELS_DIR.mkdir(exist_ok=True)
    for repo_id, preferred, save_as in PINS:
        filename = pick_file(repo_id, preferred)
        local = hf_hub_download(repo_id=repo_id, filename=filename)
        shutil.copy(local, MODELS_DIR / save_as)
        print(f"[ok] {repo_id}/{filename} -> models/{save_as}")


if __name__ == "__main__":
    main()
