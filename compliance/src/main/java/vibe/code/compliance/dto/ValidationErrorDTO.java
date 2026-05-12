package vibe.code.compliance.dto;

import java.util.Map;

public record ValidationErrorDTO(
        String message,
        Map<String, String> errors
) {}
