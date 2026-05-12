package vibe.code.compliance.dto;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AiValidationResult(
        boolean valid,
        boolean matchesType,
        int confidence,
        String reason,
        List<String> failedChecks,
        List<String> guidelines,
        String suggestion,
        SeedDashboard seedDashboard,
        String deviceSerial,
        String deviceName
) {
    public AiValidationResult(boolean valid, boolean matchesType, int confidence, String reason,
                             List<String> failedChecks, List<String> guidelines, String suggestion) {
        this(valid, matchesType, confidence, reason, failedChecks, guidelines, suggestion, null, null, null);
    }

    public AiValidationResult(boolean valid, boolean matchesType, int confidence, String reason,
                             List<String> failedChecks, List<String> guidelines, String suggestion,
                             SeedDashboard seedDashboard) {
        this(valid, matchesType, confidence, reason, failedChecks, guidelines, suggestion, seedDashboard, null, null);
    }

    public static AiValidationResult failure(String reason) {
        return new AiValidationResult(false, false, 0, reason, null, null, null, null);
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SeedDashboard(
            String malwareAlerts,
            String complianceChecks,
            String seedConfiguration,
            String operatingSystem
    ) {}
}
