# Colab GPU Training (Fast)

Use this when local CPU training is too slow.

## Part 1: Prepare zip on your laptop

Open terminal in project root and run:

```powershell
Compress-Archive -Path ".\*" -DestinationPath ".\pothole_project_colab.zip" -Force
```

This creates: `pothole_project_colab.zip`

## Part 2: Open Google Colab

1. Go to <https://colab.research.google.com>
2. New Notebook
3. Runtime -> Change runtime type -> Hardware accelerator -> **GPU**

## Part 3: Run these cells in order

### Cell 1: Upload project zip

```python
from google.colab import files
uploaded = files.upload()
```

Upload `pothole_project_colab.zip`

### Cell 2: Unzip project

```python
!unzip -q pothole_project_colab.zip -d /content/
!ls /content/Pothole_Detection/Pothole_Detection
```

If `ls` fails, check folder name in Colab left sidebar and adjust path.

### Cell 3: Install dependencies

```python
!pip install -q ultralytics
```

### Cell 4: Start training (35 epochs)

```python
!python /content/Pothole_Detection/Pothole_Detection/colab/train_colab.py
```

### Cell 5: Copy best model for download

```python
!cp /content/Pothole_Detection/Pothole_Detection/runs/pothole_colab_e35/weights/best.pt /content/best.pt
```

### Cell 6: Download best model

```python
from google.colab import files
files.download('/content/best.pt')
```

## Part 4: Put model in backend (on your laptop)

Move downloaded `best.pt` into:

`backend/models/best.pt`

PowerShell option (if download is in Downloads folder):

```powershell
copy "$env:USERPROFILE\Downloads\best.pt" ".\backend\models\best.pt"
```

## Part 5: Start backend with new model

```powershell
.\run_backend.ps1
```

Then check:

`http://127.0.0.1:8000/health`

It should show model source as `backend/models/best.pt`.
