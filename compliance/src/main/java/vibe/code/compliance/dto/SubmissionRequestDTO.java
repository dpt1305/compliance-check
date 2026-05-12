package vibe.code.compliance.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.multipart.MultipartFile;

public record SubmissionRequestDTO(
        @NotBlank(message = "Account is required") String account,
        @NotBlank(message = "Submission type is required") String submissionType,
        @NotNull(message = "Image is required") MultipartFile image
) {}
