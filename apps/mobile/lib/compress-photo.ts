import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "react-native";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

export type CompressedPhoto = {
  uri: string;
  base64: string;
};

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error ?? new Error("Failed to read image size"))
    );
  });
}

/**
 * Resize so the longest edge is at most MAX_EDGE, then JPEG-compress.
 */
export async function compressVisitPhoto(
  photoUri: string
): Promise<CompressedPhoto> {
  const { width, height } = await getImageSize(photoUri);
  const resize =
    Math.max(width, height) <= MAX_EDGE
      ? []
      : width >= height
        ? [{ resize: { width: MAX_EDGE } }]
        : [{ resize: { height: MAX_EDGE } }];

  const result = await ImageManipulator.manipulateAsync(photoUri, resize, {
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  let base64 = result.base64 ?? null;
  if (!base64) {
    base64 = await FileSystem.readAsStringAsync(result.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  return { uri: result.uri, base64 };
}
