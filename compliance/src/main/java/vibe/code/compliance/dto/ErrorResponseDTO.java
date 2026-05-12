package vibe.code.compliance.dto;

import java.time.LocalDateTime;
import java.util.Map;

public record ErrorResponseDTO(
        int status,
        String error,
        String message,
        Map<String, String> fieldErrors,
        LocalDateTime timestamp
) {
    public static ErrorResponseDTO of(int status, String error, String message) {
        return new ErrorResponseDTO(status, error, message, null, LocalDateTime.now());
    }

    public static ErrorResponseDTO withFields(int status, String error, String message, Map<String, String> fields) {
        return new ErrorResponseDTO(status, error, message, fields, LocalDateTime.now());
    }
}
