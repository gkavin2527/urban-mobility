"""Optional public Kaggle download. Run locally with kagglehub installed."""
import os
from pathlib import Path
import shutil

os.environ.setdefault('KAGGLEHUB_CACHE', str(Path(__file__).resolve().parents[1] / 'data' / 'cache'))
import kagglehub

downloaded = Path(kagglehub.dataset_download('sandheepkochi/bangalore-traffic-2023-2024'))
target = Path(__file__).resolve().parents[1] / 'data' / 'raw'
target.mkdir(parents=True, exist_ok=True)
for file in downloaded.rglob('*.csv'):
    destination = target / file.name
    shutil.copy2(file, destination)
    print(destination)
