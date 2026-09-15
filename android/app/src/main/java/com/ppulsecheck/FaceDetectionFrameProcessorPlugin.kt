package com.ppulsecheck

import android.graphics.Rect
import android.media.Image
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.min

/**
 * Detects the largest face (bbox only, per REQUIREMENTS.md §5.1) and, when found, averages RGB
 * over forehead/left-cheek/right-cheek ROIs — all natively, so the per-pixel color math never
 * touches JS (the proven FPS killer in v1).
 *
 * Coordinate-space note (REQUIREMENTS.md §5.2): ML Kit's Face.boundingBox is in the *rotated/
 * upright* coordinate space (the space InputImage.fromMediaImage(image, rotationDegrees) implies),
 * which swaps width/height relative to the raw android.media.Image buffer whenever rotation is 90
 * or 270 — confirmed on-device (a bbox of y=232,height=282 doesn't fit a 480-tall raw buffer, but
 * fits a 640-tall rotated one). The raw YUV planes are never physically rotated in memory, so ROI
 * rects must be mapped from upright space back to raw space before sampling pixels.
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
    val rawWidth = mediaImage.width
    val rawHeight = mediaImage.height
    val uprightWidth = if (rotationDegrees == 90 || rotationDegrees == 270) rawHeight else rawWidth
    val uprightHeight = if (rotationDegrees == 90 || rotationDegrees == 270) rawWidth else rawHeight

    val rois = regionsFor(box)
    val roiAverages = rois.mapValues { (_, rect) ->
      averageRgb(mediaImage, rect, rotationDegrees, rawWidth, rawHeight)
    }

    return mapOf(
      "faceDetected" to true,
      "boundingBox" to mapOf(
        "x" to box.left.toDouble(),
        "y" to box.top.toDouble(),
        "width" to box.width().toDouble(),
        "height" to box.height().toDouble()
      ),
      "frameWidth" to uprightWidth.toDouble(),
      "frameHeight" to uprightHeight.toDouble(),
      "rotationDegrees" to rotationDegrees.toDouble(),
      "regions" to roiAverages.mapValues { (_, avg) ->
        mapOf("r" to avg.r, "g" to avg.g, "b" to avg.b, "coveredRatio" to avg.coveredRatio)
      }
    )
  }

  /** Forehead + left/right cheek, defined as fractions of the face bbox (upright space). */
  private fun regionsFor(box: Rect): Map<String, Rect> {
    fun rect(fx: Double, fy: Double, fw: Double, fh: Double): Rect {
      val x = box.left + (box.width() * fx).toInt()
      val y = box.top + (box.height() * fy).toInt()
      return Rect(x, y, x + (box.width() * fw).toInt(), y + (box.height() * fh).toInt())
    }
    return mapOf(
      "forehead" to rect(0.30, 0.08, 0.40, 0.15),
      "leftCheek" to rect(0.12, 0.45, 0.22, 0.20),
      "rightCheek" to rect(0.66, 0.45, 0.22, 0.20)
    )
  }

  private data class RgbAverage(val r: Double, val g: Double, val b: Double, val coveredRatio: Double)

  private val zeroAverage = RgbAverage(0.0, 0.0, 0.0, 0.0)

  /**
   * Maps [uprightRect] from upright/display coordinates into the raw buffer's coordinate space
   * (per the class doc above), clamps to the raw buffer bounds, then averages YUV->RGB over it
   * (subsampled every 4px — this is a small ROI, not a full-frame walk).
   */
  private fun averageRgb(image: Image, uprightRect: Rect, rotationDegrees: Int, rawW: Int, rawH: Int): RgbAverage {
    val corners = listOf(
      mapUprightToRaw(uprightRect.left, uprightRect.top, rotationDegrees, rawW, rawH),
      mapUprightToRaw(uprightRect.right, uprightRect.top, rotationDegrees, rawW, rawH),
      mapUprightToRaw(uprightRect.left, uprightRect.bottom, rotationDegrees, rawW, rawH),
      mapUprightToRaw(uprightRect.right, uprightRect.bottom, rotationDegrees, rawW, rawH)
    )
    val requestedArea = max(1, uprightRect.width() * uprightRect.height())

    val sx0 = max(0, corners.minOf { it.first })
    val sx1 = min(rawW - 1, corners.maxOf { it.first })
    val sy0 = max(0, corners.minOf { it.second })
    val sy1 = min(rawH - 1, corners.maxOf { it.second })
    if (sx1 <= sx0 || sy1 <= sy0) return zeroAverage

    val clampedArea = (sx1 - sx0) * (sy1 - sy0)

    val yPlane = image.planes[0]
    val uPlane = image.planes[1]
    val vPlane = image.planes[2]
    val yBuffer = yPlane.buffer
    val uBuffer = uPlane.buffer
    val vBuffer = vPlane.buffer
    val yRowStride = yPlane.rowStride
    val yPixelStride = yPlane.pixelStride
    val uRowStride = uPlane.rowStride
    val uPixelStride = uPlane.pixelStride
    val vRowStride = vPlane.rowStride
    val vPixelStride = vPlane.pixelStride

    var sumR = 0.0
    var sumG = 0.0
    var sumB = 0.0
    var count = 0
    val step = 4

    var sy = sy0
    while (sy < sy1) {
      var sx = sx0
      while (sx < sx1) {
        val yIndex = sy * yRowStride + sx * yPixelStride
        val uvRow = sy / 2
        val uvCol = sx / 2
        val uIndex = uvRow * uRowStride + uvCol * uPixelStride
        val vIndex = uvRow * vRowStride + uvCol * vPixelStride
        if (yIndex < yBuffer.capacity() && uIndex < uBuffer.capacity() && vIndex < vBuffer.capacity()) {
          val yVal = yBuffer.get(yIndex).toInt() and 0xFF
          val uVal = (uBuffer.get(uIndex).toInt() and 0xFF) - 128
          val vVal = (vBuffer.get(vIndex).toInt() and 0xFF) - 128

          val r = (yVal + 1.402 * vVal).coerceIn(0.0, 255.0)
          val g = (yVal - 0.344136 * uVal - 0.714136 * vVal).coerceIn(0.0, 255.0)
          val b = (yVal + 1.772 * uVal).coerceIn(0.0, 255.0)

          sumR += r
          sumG += g
          sumB += b
          count++
        }
        sx += step
      }
      sy += step
    }

    if (count == 0) return zeroAverage
    return RgbAverage(sumR / count, sumG / count, sumB / count, clampedArea.toDouble() / requestedArea)
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

/**
 * Inverse of "rotate raw buffer clockwise by [rotationDegrees] to get upright" — given a point in
 * upright space, returns the corresponding point in the raw (unrotated) buffer. Derived directly
 * from the standard 90°-rotation index formulas, not guessed (REQUIREMENTS.md §5.2). Front-camera
 * mirroring is not corrected here — it only swaps left/right cheek labeling, not pixel values, so
 * it doesn't affect the Phase 3 checkpoint (values responding to lens coverage / distance).
 */
private fun mapUprightToRaw(rx: Int, ry: Int, rotationDegrees: Int, rawW: Int, rawH: Int): Pair<Int, Int> {
  return when (rotationDegrees) {
    90 -> Pair(ry, rawH - 1 - rx)
    180 -> Pair(rawW - 1 - rx, rawH - 1 - ry)
    270 -> Pair(rawW - 1 - ry, rx)
    else -> Pair(rx, ry)
  }
}
