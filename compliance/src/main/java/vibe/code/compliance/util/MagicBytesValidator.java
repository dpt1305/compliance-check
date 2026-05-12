package vibe.code.compliance.util;

import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Arrays;
import java.util.Set;

public class MagicBytesValidator {

    private static final Set<String> ALLOWED_MIME_TYPES = Set.of(
            "image/jpeg", "image/png", "image/webp"
    );

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            ".jpg", ".jpeg", ".png", ".webp"
    );

    public static void validate(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Image file is required and cannot be empty");
        }

        if (file.getSize() > 10 * 1024 * 1024) {
            throw new IllegalArgumentException("Image file size must not exceed 10MB");
        }

        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_MIME_TYPES.contains(contentType.toLowerCase())) {
            throw new IllegalArgumentException("Invalid MIME type: " + contentType + ". Allowed: jpeg, png, webp");
        }

        String originalFilename = file.getOriginalFilename();
        if (originalFilename != null) {
            String lower = originalFilename.toLowerCase();
            boolean validExt = ALLOWED_EXTENSIONS.stream().anyMatch(lower::endsWith);
            if (!validExt) {
                throw new IllegalArgumentException("Invalid file extension. Allowed: .jpg, .jpeg, .png, .webp");
            }
        }

        byte[] header = Arrays.copyOf(file.getBytes(), Math.min(12, (int) file.getSize()));
        ImageType detectedType = detectType(header);

        if (detectedType == null) {
            throw new IllegalArgumentException("File does not match a recognized image format (JPEG, PNG, or WEBP)");
        }

        if (!detectedType.matchesMime(contentType)) {
            throw new IllegalArgumentException(
                    "File content mismatch: declared MIME type '" + contentType +
                    "' does not match actual file content (" + detectedType + ")"
            );
        }
    }

    public static String getExtension(MultipartFile file) throws IOException {
        byte[] header = Arrays.copyOf(file.getBytes(), Math.min(12, (int) file.getSize()));
        ImageType type = detectType(header);
        if (type == null) throw new IllegalArgumentException("Cannot determine image type from file content");
        return type.extension();
    }

    private static ImageType detectType(byte[] header) {
        if (header.length >= 3 && isJpeg(header)) return ImageType.JPEG;
        if (header.length >= 4 && isPng(header)) return ImageType.PNG;
        if (header.length >= 12 && isWebp(header)) return ImageType.WEBP;
        return null;
    }

    private static boolean isJpeg(byte[] b) {
        return b[0] == (byte) 0xFF && b[1] == (byte) 0xD8 && b[2] == (byte) 0xFF;
    }

    private static boolean isPng(byte[] b) {
        return b[0] == (byte) 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47;
    }

    private static boolean isWebp(byte[] b) {
        // RIFF????WEBP
        return b[0] == 0x52 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x46
                && b[8] == 0x57 && b[9] == 0x45 && b[10] == 0x42 && b[11] == 0x50;
    }

    private enum ImageType {
        JPEG(".jpg") {
            @Override
            public boolean matchesMime(String mime) {
                return mime != null && (mime.contains("jpeg") || mime.contains("jpg"));
            }
        },
        PNG(".png") {
            @Override
            public boolean matchesMime(String mime) {
                return mime != null && mime.contains("png");
            }
        },
        WEBP(".webp") {
            @Override
            public boolean matchesMime(String mime) {
                return mime != null && mime.contains("webp");
            }
        };

        private final String ext;

        ImageType(String ext) { this.ext = ext; }

        public String extension() { return ext; }

        public abstract boolean matchesMime(String mime);
    }
}
