package vibe.code.compliance.service.ai;

import vibe.code.compliance.dto.AiValidationResult;

public interface AiValidationService {
    AiValidationResult validate(byte[] imageBytes, String mimeType, String expectedType);
}
