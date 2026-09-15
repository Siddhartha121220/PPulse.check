package com.ppulsecheck

import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import java.util.concurrent.TimeUnit

/**
 * Returns a plain bbox for the largest detected face, or null if none — bbox-only, no
 * contours/landmarks/classification/autoMode (REQUIREMENTS.md §5.1: v1 proved none of that
 * was consumed downstream and contour mode made detection measurably less reliable).
 *
 * Feeds the frame's android.media.Image directly to InputImage.fromMediaImage (the fast YUV
 * path), not a decoded RGBA bitmap — the RGBA fallback was the other proven FPS killer in v1.
 */
class FaceDetectionFrameProcessorPlugin : FrameProcessorPlugin() {
  private val detector = FaceDetection.getClient(
    FaceDetectorOptions.Builder()
      .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
      .build()
  )

  override fun callback(frame: Frame, params: Map<String, Any?>?): Any? {
    val mediaImage = frame.image ?: return null
    val rotationDegrees = frame.orientation.toDegrees()
    val inputImage = InputImage.fromMediaImage(mediaImage, rotationDegrees)

    val faces = try {
      Tasks.await(detector.process(inputImage), 1, TimeUnit.SECONDS)
    } catch (e: Exception) {
      return mapOf("error" to (e.message ?: e.javaClass.simpleName))
    }

    val face = faces.maxByOrNull { it.boundingBox.width() * it.boundingBox.height() }
      ?: return mapOf("faceDetected" to false)

    val box = face.boundingBox
    return mapOf(
      "faceDetected" to true,
      "boundingBox" to mapOf(
        "x" to box.left.toDouble(),
        "y" to box.top.toDouble(),
        "width" to box.width().toDouble(),
        "height" to box.height().toDouble()
      ),
      "frameWidth" to frame.width.toDouble(),
      "frameHeight" to frame.height.toDouble()
    )
  }

  companion object {
    init {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("detectFace") { proxy, options ->
        FaceDetectionFrameProcessorPlugin()
      }
    }
  }
}

private fun com.mrousavy.camera.core.types.Orientation.toDegrees(): Int = when (this) {
  com.mrousavy.camera.core.types.Orientation.PORTRAIT -> 0
  com.mrousavy.camera.core.types.Orientation.LANDSCAPE_RIGHT -> 90
  com.mrousavy.camera.core.types.Orientation.PORTRAIT_UPSIDE_DOWN -> 180
  com.mrousavy.camera.core.types.Orientation.LANDSCAPE_LEFT -> 270
}
