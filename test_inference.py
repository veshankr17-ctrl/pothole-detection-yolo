from ultralytics import YOLO


def main() -> None:
    model = YOLO("runs/pothole_yolov8n/weights/best.pt")
    model.predict(
        source="sample_video.mp4",
        conf=0.35,
        save=True,
        project="runs",
        name="pothole_inference_demo",
    )


if __name__ == "__main__":
    main()
