package vibe.code.compliance.dto;

import vibe.code.compliance.model.Submission;

import java.time.LocalDateTime;

public record SubmissionResponseDTO(
        Long id,
        String account,
        String submissionType,
        String imageUrl,
        String imageSavedName,
        Submission.SubmissionStatus status,
        String validationResult,
        LocalDateTime submissionDate
) {
    public static SubmissionResponseDTO from(Submission s) {
        return new SubmissionResponseDTO(
                s.getId(), s.getAccount(), s.getSubmissionType(),
                s.getImageUrl(), s.getImageSavedName(), s.getStatus(),
                s.getValidationResult(), s.getSubmissionDate()
        );
    }
}
