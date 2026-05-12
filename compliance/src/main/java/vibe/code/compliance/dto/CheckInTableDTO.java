package vibe.code.compliance.dto;

import vibe.code.compliance.model.Submission;

import java.time.LocalDateTime;

public record CheckInTableDTO(
        String account,
        String submissionType,
        Submission.SubmissionStatus status,
        LocalDateTime submissionDate,
        String imageUrl
) {
    public static CheckInTableDTO from(Submission s) {
        return new CheckInTableDTO(
                s.getAccount(), s.getSubmissionType(),
                s.getStatus(), s.getSubmissionDate(), s.getImageUrl()
        );
    }
}
