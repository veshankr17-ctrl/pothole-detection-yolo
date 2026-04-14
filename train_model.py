from ultralytics import YOLO


def main() -> None:
    model = YOLO("yolov8n.pt")
    model.train(
        data="data.yaml",
        epochs=60,
        imgsz=640,
        batch=16,
        project="runs",
        name="pothole_yolov8n",
    )


if __name__ == "__main__":
    main()
