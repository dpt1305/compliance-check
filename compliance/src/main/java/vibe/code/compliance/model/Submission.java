package vibe.code.compliance.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
public class Submission {

    private Long id;
    private String account;
    private String submissionType;

    private String imagePath;
    private String imageUrl;
    private String imageOriginalName;
    private String imageSavedName;

    private SubmissionStatus status = SubmissionStatus.PENDING;
    private String validationResult;
    private String validationChecklist;

    private Boolean hasClock;
    private Boolean hasWindowsUpdate;
    private Boolean hasDeviceName;
    private Boolean hasDeviceSerial;
    private Boolean hasDashboard;
    private Boolean hasSeedDashboard;
    private Boolean hasTrellix;
    private Boolean hasTimestamp;
    private Boolean hasMacInfo;
    private Integer confidenceScore;

    @JsonProperty("submissionDate")
    private LocalDateTime submissionDate;

    public Submission() {
        this.submissionDate = LocalDateTime.now();
    }

    public enum SubmissionStatus {
        PENDING, APPROVED, REJECTED
    }
}
