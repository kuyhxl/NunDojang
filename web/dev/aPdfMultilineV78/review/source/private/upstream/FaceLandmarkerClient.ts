import { FaceLandmarker, FilesetResolver, DrawingUtils, FaceLandmarkerResult } from "@mediapipe/tasks-vision";

// References
// https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js#video
export default class FaceLandmarkerClient {
  private faceLandmarker: any;

  constructor() {
  }

  async initialize(baseUrl: string) {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      `${baseUrl.replace(/\/$/, "")}/vision`
    );
    this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: `${baseUrl.replace(/\/$/, "")}/models/face_landmarker.task`,
        delegate: "GPU",
      },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: "IMAGE",
      numFaces: 1,
    });
  }

  close() { this.faceLandmarker?.close(); this.faceLandmarker = null; }

  async processFrame(frame: ImageData): Promise<FaceLandmarkerResult | null> {
    if (!this.faceLandmarker) {
      console.error("FaceLandmarker is not loaded yet.");
      return null;
    }

    let result: FaceLandmarkerResult;
    result = await this.faceLandmarker.detect(frame);
    return result;
  }
}
