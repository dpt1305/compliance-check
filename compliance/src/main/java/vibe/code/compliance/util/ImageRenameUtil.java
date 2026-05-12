package vibe.code.compliance.util;

import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

public class ImageRenameUtil {

    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd");

    /**
     * Generates the saved filename: {userId}_{type}_{yyyyMMdd}_{uuid8}.{ext}
     */
    public static String generateSavedName(String userId, String submissionType, MultipartFile file) throws IOException {
        String ext = MagicBytesValidator.getExtension(file);
        String date = LocalDate.now().format(DATE_FORMAT);
        String uuid8 = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        String safeUserId = sanitize(userId);
        String safeType = sanitize(submissionType);
        return safeUserId + "_" + safeType + "_" + date + "_" + uuid8 + ext;
    }

    /**
     * Generates the frontend preview filename (uses account instead of userId).
     */
    public static String generatePreviewName(String account, String submissionType, String originalFilename) {
        String ext = extractExtension(originalFilename);
        String date = LocalDate.now().format(DATE_FORMAT);
        return sanitize(account) + "_" + sanitize(submissionType) + "_" + date + ext;
    }

    private static String sanitize(String input) {
        return input == null ? "unknown" : input.toLowerCase().replaceAll("[^a-z0-9]", "");
    }

    private static String extractExtension(String filename) {
        if (filename == null) return ".jpg";
        int dot = filename.lastIndexOf('.');
        return dot >= 0 ? filename.substring(dot).toLowerCase() : ".jpg";
    }
}
