package vibe.code.compliance.dto;

import vibe.code.compliance.model.Submission;

import java.time.LocalDateTime;

public record AdminUserDTO(
        Long id,
        String account,
        String submissionType,
        Submission.SubmissionStatus status,
        String imageUrl,
        String imageSavedName,
        String validationResult,
        LocalDateTime submissionDate
) {
    public static AdminUserDTO from(Submission s) {
        return new AdminUserDTO(
                s.getId(), s.getAccount(), s.getSubmissionType(),
                s.getStatus(), s.getImageUrl(), s.getImageSavedName(),
                s.getValidationResult(), s.getSubmissionDate()
        );
    }
}
